import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  TRANSFER_VERSION,
  decodeTransferFrames,
  encodeTransferFrames,
  type TransferSnapshot,
} from "@/shared/transfer";

import { StoreError } from "@/lib/store-error";
import { useSettings } from "@/lib/settings-store";
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
  isUrgentDeadline,
  type Entry,
  nextMilestoneNudge,
  weeklyDelta,
  jarAccent,
  jarAccentDark,
  type Jar,
  type JarKind,
  applyEntry,
  money,
  newlyEarnedBadges,
  normaliseJar,
  percent,
  type QuickPreset,
  type QuickPresetId,
  activeJars,
  nextRecurringDate,
  quickPresets,
  runDueRecurring,
  sanitizeAmountInput,
  toMinor,
} from "@/lib/domain";

export type {
  Accent,
  Badge,
  BadgeId,
  BadgeStats,
  Cadence,
  Entry,
  Jar,
  JarKind,
  QuickPreset,
  QuickPresetId,
};
export {
  CADENCES,
  activeJars,
  badges,
  badgeStats,
  deadlineCountdown,
  isUrgentDeadline,
  nextMilestoneNudge,
  weeklyDelta,
  nextRecurringDate,
  jarAccent,
  jarAccentDark,
  money,
  newlyEarnedBadges,
  percent,
  quickPresets,
  sanitizeAmountInput,
  toMinor,
};
export { StoreError, type StoreErrorCode } from "@/lib/store-error";

/** Returns a money(minor) formatter bound to the user's active currency. */
export function useMoney(): (minor: number) => string {
  const { currency } = useSettings();
  return (minor: number) => money(minor, currency);
}

const KEY = "saving-jar:v3";
const BACKUP_KEY = "saving-jar:v3:backup";

const StoreContext = createContext<Store | null>(null);

type JarInput = Pick<
  Jar,
  "name" | "target" | "accent" | "icon" | "kind" | "deadline" | "streak"
> & {
  recurring?: Jar["recurring"];
};

type Store = {
  /** All jars on this device. */
  jars: Jar[];
  /** Same as jars — all jars are device-local. */
  localJars: Jar[];
  ready: boolean;
  addJar: (input: JarInput) => string;
  editJar: (
    id: string,
    input: Partial<
      Pick<
        Jar,
        | "name"
        | "target"
        | "accent"
        | "icon"
        | "kind"
        | "deadline"
        | "streak"
        | "recurring"
      >
    >,
  ) => void;
  archiveJar: (id: string) => void;
  /** Bring an archived jar back into the active list. */
  restoreJar: (id: string) => void;
  /** Permanently remove an archived jar and its history. */
  deleteJarPermanently: (id: string) => void;
  /** Returns the highest milestone newly reached, or undefined when rejected. */
  addEntry: (
    id: string,
    amountMinor: number,
    direction: Entry["direction"],
    note?: string,
    source?: Entry["source"],
  ) => number | undefined;
  /**
   * Everything on this device, ready to be handed to another device as QR
   * frames.
   */
  exportTransfer: (currency?: string) => string[];
  /**
   * Fold a scanned transfer into this device. Returns the number of jars added
   * or updated, so the receiving screen can report something true.
   */
  importTransfer: (frames: string[]) => {
    added: number;
    updated: number;
    skipped: number;
    error?: string;
  };
  total: number;
};

function parseJars(raw: string | null): Jar[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item && typeof item === "object" && typeof item.id === "string",
      )
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
  const [jars, setJars] = useState<Jar[]>([]);
  const [ready, setReady] = useState(false);
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
        setJars(caughtUp);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready) persistJars(jars);
  }, [jars, ready]);

  const commit = useCallback((next: Jar[]) => {
    jarsRef.current = next;
    setJars(next);
  }, []);

  const store = useMemo<Store>(() => {
    return {
      jars,
      localJars: jars,
      ready,
      total: jars
        .filter((jar) => !jar.archived)
        .reduce((sum, jar) => sum + jar.balance, 0),
      addJar: (input) => {
        const id = `jar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        commit([
          ...jarsRef.current,
          {
            ...input,
            id,
            balance: 0,
            createdAt: new Date().toISOString(),
            milestonesHit: [],
            entries: [],
          },
        ]);
        return id;
      },
      editJar: (id, input) => {
        commit(
          jarsRef.current.map((jar) =>
            jar.id === id ? { ...jar, ...input } : jar,
          ),
        );
      },
      archiveJar: (id) => {
        commit(
          jarsRef.current.map((jar) =>
            jar.id === id ? { ...jar, archived: true } : jar,
          ),
        );
      },
      restoreJar: (id) => {
        commit(
          jarsRef.current.map((jar) =>
            jar.id === id ? { ...jar, archived: false } : jar,
          ),
        );
      },
      deleteJarPermanently: (id) => {
        commit(jarsRef.current.filter((jar) => jar.id !== id));
      },
      exportTransfer: (currency) => {
        const snapshot: TransferSnapshot = {
          version: TRANSFER_VERSION,
          exportedAt: new Date().toISOString(),
          currency,
          jars: jarsRef.current,
        };
        return encodeTransferFrames(snapshot);
      },
      importTransfer: (frames) => {
        const assembly = decodeTransferFrames(frames);
        if (!assembly)
          return {
            added: 0,
            updated: 0,
            skipped: 0,
            error: "That does not look like a Saving Jar code.",
          };
        if (assembly.error)
          return { added: 0, updated: 0, skipped: 0, error: assembly.error };
        if (!assembly.snapshot) {
          return {
            added: 0,
            updated: 0,
            skipped: 0,
            error: `Still missing ${assembly.missing.length} code${assembly.missing.length === 1 ? "" : "s"}.`,
          };
        }

        const incoming = assembly.snapshot.jars;
        const existing = new Map(jarsRef.current.map((jar) => [jar.id, jar]));
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const next = [...jarsRef.current];

        for (const jar of incoming) {
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
        const jar = jarsRef.current.find((candidate) => candidate.id === id);
        if (!jar || !Number.isInteger(amountMinor) || amountMinor <= 0)
          return undefined;
        if (direction === "withdrawal" && amountMinor > jar.balance)
          return undefined;
        const applied = applyEntry(jar, amountMinor, direction, note, source);
        if (!applied) return undefined;
        commit(
          jarsRef.current.map((item) => (item.id === id ? applied.jar : item)),
        );
        return applied.reached.length
          ? Math.max(...applied.reached)
          : undefined;
      },
    };
  }, [jars, ready, commit]);

  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

export function useSavings() {
  const value = useContext(StoreContext);
  if (!value)
    throw new StoreError(
      "provider-missing",
      "useSavings must be used within SavingsProvider",
    );
  return value;
}
