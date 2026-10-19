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
import { loadPersistedJars, persistJars } from "@/lib/savings-storage";
import { reportError } from "@/lib/error-reporting";
import { mergeTransferJars } from "@/lib/transfer-merge";
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
  percent,
  type QuickPreset,
  type QuickPresetId,
  activeJars,
  nextRecurringDate,
  quickPresets,
  runDueRecurringSafely,
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
  storageError: string | null;
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
  importTransfer: (
    frames: string[],
    currentCurrency?: string,
  ) => {
    added: number;
    updated: number;
    skipped: number;
    error?: string;
  };
  total: number;
};

export function SavingsProvider({ children }: { children: React.ReactNode }) {
  const [jars, setJars] = useState<Jar[]>([]);
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  // Mirror of state so mutations always compute against fresh data even when
  // multiple calls happen inside one render cycle (double-tap safe).
  const jarsRef = useRef<Jar[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadPersistedJars(AsyncStorage)
      .then(({ jars: loaded, writable: canWrite }) => {
        if (cancelled) return;
        setWritable(canWrite);
        if (!canWrite)
          setStorageError(
            "Saved data could not be read. Changes will not be saved.",
          );
        // Catch up due scheduled deposits before first paint of data.
        const now = new Date();
        const caughtUp = runDueRecurringSafely(loaded, now);
        jarsRef.current = caughtUp;
        setJars(caughtUp);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStorageError(
          "Saved data could not be read. Changes will not be saved.",
        );
        reportError(error);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !writable) return;
    persistJars(AsyncStorage, jars).then(
      () => setStorageError(null),
      (error: unknown) => {
        setStorageError("Your latest changes could not be saved.");
        reportError(error);
      },
    );
  }, [jars, ready, writable]);

  const commit = useCallback((next: Jar[]) => {
    jarsRef.current = next;
    setJars(next);
  }, []);

  const store = useMemo<Store>(() => {
    return {
      jars,
      localJars: jars,
      ready,
      storageError,
      total: jars
        .filter((jar) => !jar.archived)
        .reduce((sum, jar) => sum + jar.balance, 0),
      addJar: (input) => {
        if (
          !input.name.trim() ||
          !Number.isSafeInteger(input.target) ||
          input.target <= 0 ||
          (input.recurring !== undefined &&
            (!Number.isSafeInteger(input.recurring.amount) ||
              input.recurring.amount <= 0))
        )
          throw new StoreError(
            "invalid-amount",
            "Enter a valid target amount.",
          );
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
        if (
          (input.target !== undefined &&
            (!Number.isSafeInteger(input.target) || input.target <= 0)) ||
          (input.recurring !== undefined &&
            (!Number.isSafeInteger(input.recurring.amount) ||
              input.recurring.amount <= 0))
        )
          throw new StoreError("invalid-amount", "Enter valid jar amounts.");
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
      importTransfer: (frames, currentCurrency) => {
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

        const merged = mergeTransferJars(
          jarsRef.current,
          assembly.snapshot.jars,
          assembly.snapshot.currency,
          currentCurrency,
        );
        if (merged.error)
          return { added: 0, updated: 0, skipped: 0, error: merged.error };
        if (merged.added > 0 || merged.updated > 0) commit(merged.jars);
        return {
          added: merged.added,
          updated: merged.updated,
          skipped: merged.skipped,
        };
      },
      addEntry: (id, amountMinor, direction, note, source = "manual") => {
        const jar = jarsRef.current.find((candidate) => candidate.id === id);
        if (!jar || !Number.isSafeInteger(amountMinor) || amountMinor <= 0)
          return undefined;
        if (direction === "withdrawal" && amountMinor > jar.balance)
          return undefined;
        const applied = applyEntry(jar, amountMinor, direction, note, source);
        if (!applied) return undefined;
        const nextTotal = jarsRef.current
          .filter((item) => !item.archived)
          .reduce(
            (total, item) =>
              total + (item.id === id ? applied.jar.balance : item.balance),
            0,
          );
        if (!Number.isSafeInteger(nextTotal)) return undefined;
        commit(
          jarsRef.current.map((item) => (item.id === id ? applied.jar : item)),
        );
        return applied.reached.length
          ? Math.max(...applied.reached)
          : undefined;
      },
    };
  }, [jars, ready, storageError, commit]);

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
