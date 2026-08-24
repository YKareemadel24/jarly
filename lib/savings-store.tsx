import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  CADENCES,
  type Accent,
  type Cadence,
  deadlineCountdown,
  type Entry,
  jarAccent,
  jarAccentDark,
  type Jar,
  type JarKind,
  applyEntry,
  money,
  normaliseJar,
  percent,
  runDueRecurring,
  sanitizeAmountInput,
  toMinor,
} from "@/lib/savings-core";

export type { Accent, Cadence, Entry, Jar, JarKind };
export { CADENCES, deadlineCountdown, jarAccent, jarAccentDark, money, percent, sanitizeAmountInput, toMinor };

const KEY = "saving-jar:v3";
const BACKUP_KEY = "saving-jar:v3:backup";

const StoreContext = createContext<Store | null>(null);

type JarInput = Pick<Jar, "name" | "target" | "accent" | "icon" | "kind" | "deadline" | "streak"> & {
  recurring?: Jar["recurring"];
};

type Store = {
  jars: Jar[];
  ready: boolean;
  addJar: (input: JarInput) => string;
  editJar: (id: string, input: Partial<Pick<Jar, "name" | "target" | "accent" | "icon" | "kind" | "deadline" | "streak" | "recurring">>) => void;
  archiveJar: (id: string) => void;
  /** Returns the highest milestone newly reached, or undefined when rejected. */
  addEntry: (id: string, amountMinor: number, direction: Entry["direction"], note?: string, source?: Entry["source"]) => number | undefined;
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

  const commit = (next: Jar[]) => {
    jarsRef.current = next;
    setJars(next);
  };

  const store = useMemo<Store>(() => ({
    jars,
    ready,
    total: jars.filter((jar) => !jar.archived).reduce((sum, jar) => sum + jar.balance, 0),
    addJar: (input) => {
      const id = `jar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      commit([...jarsRef.current, { ...input, id, balance: 0, createdAt: new Date().toISOString(), milestonesHit: [], entries: [] }]);
      return id;
    },
    editJar: (id, input) => {
      commit(jarsRef.current.map((jar) => (jar.id === id ? { ...jar, ...input } : jar)));
    },
    archiveJar: (id) => {
      commit(jarsRef.current.map((jar) => (jar.id === id ? { ...jar, archived: true } : jar)));
    },
    addEntry: (id, amountMinor, direction, note, source = "manual") => {
      const jar = jarsRef.current.find((candidate) => candidate.id === id);
      if (!jar || !Number.isInteger(amountMinor) || amountMinor <= 0) return undefined;
      if (direction === "withdrawal" && amountMinor > jar.balance) return undefined;
      const applied = applyEntry(jar, amountMinor, direction, note, source);
      if (!applied) return undefined;
      commit(jarsRef.current.map((item) => (item.id === id ? applied.jar : item)));
      return applied.reached.length ? Math.max(...applied.reached) : undefined;
    },
  }), [jars, ready]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useSavings() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useSavings must be used within SavingsProvider");
  return value;
}
