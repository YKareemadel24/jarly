import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { contributeToSharedJar, createSharedJar, fetchSharedJars, inviteToSharedJar, joinInvite } from "@/lib/shared-jar-api";
import { mergeJars, remoteIdFromLocalId, sharedJarLocalId, sharedJarToJar } from "@/lib/shared-jars";
import { TRANSFER_VERSION, decodeTransferFrames, encodeTransferFrames, type TransferSnapshot } from "@/shared/transfer";

import {
  CADENCES,
  type Accent,
  type Badge,
  type BadgeId,
  type BadgeStats,
  badges,
  badgeStats,
  type Cadence,
  deadlineCountdown,
  type Entry,
  jarAccent,
  jarAccentDark,
  type Jar,
  type JarKind,
  type JarMember,
  applyEntry,
  money,
  newlyEarnedBadges,
  normaliseJar,
  percent,
  type QuickPreset,
  type QuickPresetId,
  quickPresets,
  runDueRecurring,
  sanitizeAmountInput,
  toMinor,
} from "@/lib/savings-core";

export type { Accent, Badge, BadgeId, BadgeStats, Cadence, Entry, Jar, JarKind, JarMember, QuickPreset, QuickPresetId };
export { CADENCES, badges, badgeStats, deadlineCountdown, jarAccent, jarAccentDark, money, newlyEarnedBadges, percent, quickPresets, sanitizeAmountInput, toMinor };

import { useSettings } from "@/lib/settings-store";

/** Returns a money(minor) formatter bound to the user's active currency. */
export function useMoney(): (minor: number) => string {
  const { currency } = useSettings();
  return (minor: number) => money(minor, currency);
}

const KEY = "saving-jar:v3";
const BACKUP_KEY = "saving-jar:v3:backup";

const StoreContext = createContext<Store | null>(null);

type JarInput = Pick<Jar, "name" | "target" | "accent" | "icon" | "kind" | "deadline" | "streak"> & {
  recurring?: Jar["recurring"];
};

type Store = {
  /** Personal (device-local) jars followed by server-backed shared jars. */
  jars: Jar[];
  /** Just the device-local jars, so callers can persist or migrate them safely. */
  localJars: Jar[];
  ready: boolean;
  /** True while the first shared-jar fetch is in flight. */
  syncing: boolean;
  /** Non-null when shared jars could not be loaded (offline, signed out, no DB). */
  syncError: string | null;
  /** Refetch shared jars from the server. */
  refreshShared: () => void;
  addJar: (input: JarInput) => string;
  editJar: (id: string, input: Partial<Pick<Jar, "name" | "target" | "accent" | "icon" | "kind" | "deadline" | "streak" | "recurring">>) => void;
  archiveJar: (id: string) => void;
  /** Bring an archived jar back into the active list. */
  restoreJar: (id: string) => void;
  /** Permanently remove an archived jar and its history. */
  deleteJarPermanently: (id: string) => void;
  /** Returns the highest milestone newly reached, or undefined when rejected. */
  addEntry: (id: string, amountMinor: number, direction: Entry["direction"], note?: string, source?: Entry["source"]) => number | undefined;
  /** Remote id backing a shared jar, or undefined for a device-local jar. */
  remoteIdOf: (id: string) => number | undefined;
  /**
   * Create a server-backed shared jar and return its local id. Rejects when the
   * caller is signed out or offline, so the caller can surface a real message
   * instead of silently creating a device-local jar by mistake.
   */
  createSharedJar: (input: JarInput) => Promise<string>;
  /**
   * Contribute to a shared jar through the server. The server recomputes the
   * balance, so this refreshes the jar list rather than mutating locally.
   */
  contributeShared: (id: string, amountMinor: number, direction: Entry["direction"], note?: string) => Promise<void>;
  /** Owner-only: invite an account to a shared jar by its user id. */
  inviteShared: (id: string, userId: number) => Promise<void>;
  /**
   * Join a jar through an invite token, then refresh so it appears immediately.
   * Returns the local id of the joined jar. Rejects when the token is unusable.
   */
  joinShared: (token: string) => Promise<string>;
  /**
   * Everything on this device, ready to be handed to another device as QR
   * frames. Shared jars are excluded: the server already owns them.
   */
  exportTransfer: (currency?: string) => string[];
  /**
   * Fold a scanned transfer into this device. Returns the number of jars added
   * or updated, so the receiving screen can report something true.
   */
  importTransfer: (frames: string[]) => { added: number; updated: number; skipped: number; error?: string };
  total: number;
};

function parseJars(raw: string | null): Jar[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object" && typeof item.id === "string")
      .map((jar) => normaliseJar(jar));
  } catch {
    return [];
  }
}

async function loadPersistedJars(): Promise<Jar[]> {
  // Current version first; fall back to legacy versions with float -> minor-unit migration.
  const current = parseJars(await AsyncStorage.getItem(KEY));
  if (current.length > 0) return current;

  for (const legacyKey of ["saving-jar:v2", "saving-jar:v1"] as const) {
    try {
      const raw = await AsyncStorage.getItem(legacyKey);
      if (!raw) continue;
      const legacy = JSON.parse(raw);
      if (Array.isArray(legacy) && legacy.length > 0) {
        return legacy.map((jar) => normaliseJar(jar, true));
      }
    } catch {
      // try next legacy source
    }
  }

  // Corrupt current store? Try the one-generation backup.
  return parseJars(await AsyncStorage.getItem(BACKUP_KEY));
}

async function persistJars(jars: Jar[]): Promise<void> {
  try {
    const previous = await AsyncStorage.getItem(KEY);
    if (previous !== null) {
      // Keep one generation of recovery data in case a write is corrupted.
      await AsyncStorage.setItem(BACKUP_KEY, previous);
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(jars));
  } catch {
    // Persistence failures are non-fatal for the session.
  }
}

export function SavingsProvider({ children }: { children: React.ReactNode }) {
  const [localJars, setLocalJars] = useState<Jar[]>([]);
  const [sharedJars, setSharedJars] = useState<Jar[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // Mirror of state so mutations always compute against fresh data even when
  // multiple calls happen inside one render cycle (double-tap safe).
  const jarsRef = useRef<Jar[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPersistedJars()
      .then((loaded) => {
        if (cancelled) return;
        // Catch up due scheduled deposits before first paint of data.
        const now = new Date();
        const caughtUp = loaded.map((jar) => runDueRecurring(jar, now).jar);
        jarsRef.current = caughtUp;
        setLocalJars(caughtUp);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only device-local jars are persisted. Shared jars are server-authoritative,
  // so writing them to AsyncStorage would create a stale second copy.
  useEffect(() => {
    if (ready) persistJars(localJars);
  }, [localJars, ready]);

  const commit = (next: Jar[]) => {
    jarsRef.current = next;
    setLocalJars(next);
  };

  const refreshShared = useCallback(() => {
    setSyncing(true);
    fetchSharedJars()
      .then((payloads) => {
        setSharedJars(payloads.map(sharedJarToJar));
        setSyncError(null);
      })
      .catch((error: unknown) => {
        // Signed out, offline, or no database: personal jars must still work,
        // so a failed sync degrades to "no shared jars" rather than an error wall.
        setSharedJars([]);
        setSyncError(error instanceof Error ? error.message : "Could not load shared jars.");
      })
      .finally(() => setSyncing(false));
  }, []);

  useEffect(() => {
    refreshShared();
  }, [refreshShared]);

  const store = useMemo<Store>(() => {
    // Personal jars first, then shared; mutations below only ever touch personal ones.
    const jars = mergeJars(localJars, sharedJars);
    const remoteIdOf = (id: string) => remoteIdFromLocalId(id);

    return {
      jars,
      localJars,
      ready,
      syncing,
      syncError,
      refreshShared,
      total: jars.filter((jar) => !jar.archived).reduce((sum, jar) => sum + jar.balance, 0),
      remoteIdOf,
      addJar: (input) => {
        const id = `jar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        commit([...jarsRef.current, { ...input, id, balance: 0, createdAt: new Date().toISOString(), milestonesHit: [], entries: [] }]);
        return id;
      },
      editJar: (id, input) => {
        // A shared jar is edited through sharedJar.update, never locally.
        if (remoteIdOf(id) !== undefined) return;
        commit(jarsRef.current.map((jar) => (jar.id === id ? { ...jar, ...input } : jar)));
      },
      archiveJar: (id) => {
        if (remoteIdOf(id) !== undefined) return;
        commit(jarsRef.current.map((jar) => (jar.id === id ? { ...jar, archived: true } : jar)));
      },
      restoreJar: (id) => {
        if (remoteIdOf(id) !== undefined) return;
        commit(jarsRef.current.map((jar) => (jar.id === id ? { ...jar, archived: false } : jar)));
      },
      deleteJarPermanently: (id) => {
        if (remoteIdOf(id) !== undefined) return;
        commit(jarsRef.current.filter((jar) => jar.id !== id));
      },
      createSharedJar: async (input) => {
        const remoteId = await createSharedJar({
          name: input.name,
          icon: input.icon,
          accent: input.accent,
          kind: input.kind,
          target: input.target,
        });
        // Pull the authoritative row back so the new jar renders with its real
        // member list rather than an optimistic guess.
        await refreshShared();
        return sharedJarLocalId(remoteId);
      },
      contributeShared: async (id, amountMinor, direction, note) => {
        const remoteId = remoteIdOf(id);
        if (remoteId === undefined) throw new Error("That jar is not shared.");
        if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw new Error("Amount must be greater than zero.");
        await contributeToSharedJar({ jarId: remoteId, amount: amountMinor, direction, note });
        // Re-read rather than patching: another member may have contributed too.
        await refreshShared();
      },
      inviteShared: async (id, userId) => {
        const remoteId = remoteIdOf(id);
        if (remoteId === undefined) throw new Error("That jar is not shared.");
        if (!Number.isInteger(userId) || userId <= 0) throw new Error("Enter a valid account id.");
        await inviteToSharedJar(remoteId, userId);
        // Re-read so the new member (and their zero balance) appears immediately.
        await refreshShared();
      },
      joinShared: async (token) => {
        const joined = await joinInvite(token);
        // The jar is server-authoritative, so the only correct way to show it is
        // to re-read: a local guess could disagree with what other members see.
        await refreshShared();
        return sharedJarLocalId(joined.jarId);
      },
      exportTransfer: (currency) => {
        // Only device-local jars travel. A shared jar lives on the server and
        // every member already sees it by signing in, so copying one here would
        // create a stale second copy of a balance the server owns.
        const snapshot: TransferSnapshot = {
          version: TRANSFER_VERSION,
          exportedAt: new Date().toISOString(),
          currency,
          jars: jarsRef.current.filter((jar) => remoteIdOf(jar.id) === undefined),
        };
        return encodeTransferFrames(snapshot);
      },
      importTransfer: (frames) => {
        const assembly = decodeTransferFrames(frames);
        if (!assembly) return { added: 0, updated: 0, skipped: 0, error: "That does not look like a Saving Jar code." };
        if (assembly.error) return { added: 0, updated: 0, skipped: 0, error: assembly.error };
        if (!assembly.snapshot) {
          return { added: 0, updated: 0, skipped: 0, error: `Still missing ${assembly.missing.length} code${assembly.missing.length === 1 ? "" : "s"}.` };
        }

        const incoming = assembly.snapshot.jars;
        const existing = new Map(jarsRef.current.map((jar) => [jar.id, jar]));
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const next = [...jarsRef.current];

        for (const jar of incoming) {
          // A shared jar id can never legitimately arrive in a transfer, so a
          // collision with one means the payload is not what it claims to be.
          if (remoteIdOf(jar.id) !== undefined) {
            skipped += 1;
            continue;
          }
          const current = existing.get(jar.id);
          if (!current) {
            next.push(jar);
            added += 1;
            continue;
          }
          // Same jar on both devices: the one with more history wins, so a
          // half-filled receiving device is not clobbered by an older copy.
          if (jar.entries.length > current.entries.length) {
            const index = next.findIndex((item) => item.id === jar.id);
            if (index >= 0) next[index] = jar;
            updated += 1;
          } else {
            skipped += 1;
          }
        }

        if (added > 0 || updated > 0) commit(next);
        return { added, updated, skipped };
      },
      addEntry: (id, amountMinor, direction, note, source = "manual") => {
        // Shared jars accept contributions only through sharedJar.contribute, so
        // the server stays the single writer of their balance.
        if (remoteIdOf(id) !== undefined) return undefined;
        const jar = jarsRef.current.find((candidate) => candidate.id === id);
        if (!jar || !Number.isInteger(amountMinor) || amountMinor <= 0) return undefined;
        if (direction === "withdrawal" && amountMinor > jar.balance) return undefined;
        const applied = applyEntry(jar, amountMinor, direction, note, source);
        if (!applied) return undefined;
        commit(jarsRef.current.map((item) => (item.id === id ? applied.jar : item)));
        return applied.reached.length ? Math.max(...applied.reached) : undefined;
      },
    };
  }, [localJars, sharedJars, ready, syncing, syncError, refreshShared, commit]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useSavings() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useSavings must be used within SavingsProvider");
  return value;
}
