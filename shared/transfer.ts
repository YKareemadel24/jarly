/**
 * Device-to-device transfer codec.
 *
 * Moving jars to a new phone must not require an account, a server, or a cable.
 * The sending device renders a snapshot as a sequence of QR codes; the receiving
 * device scans them in any order. The wire format therefore has to survive being
 * read by a camera: base64url only, no whitespace, and every frame carries
 * enough header to be reassembled out of order or after a double scan.
 *
 * Pure and dependency-free. No Buffer, no TextEncoder, no zlib: a snapshot is
 * split into fixed-size frames and each frame is a self-describing string.
 */

import type {
  Accent,
  Cadence,
  Entry,
  EntryRevision,
  Jar,
  JarKind,
  JarReminder,
} from "../lib/savings-core";
import {
  isValidEntryRevision,
  validEntryAudit,
} from "../lib/domain/transactions";
import { isValidJarReminder } from "../lib/domain/reminder";

/** Marker every frame starts with. Bumping it is a breaking format change. */
export const TRANSFER_PREFIX = "JARLY1";

/**
 * Characters of payload per frame.
 *
 * Sized for a phone camera held at arm's length, not for the theoretical limit
 * of a QR code: every extra 100 characters pushes the symbol to a higher
 * version, which means smaller modules and a fussier scan. A larger transfer
 * simply becomes more frames.
 */
export const TRANSFER_CHUNK_CHARS = 400;

/** Payload version this build writes. */
export const TRANSFER_VERSION = 2;

export type TransferSnapshot = {
  version: number;
  exportedAt: string;
  /** Currency the amounts are denominated in, so the receiver can confirm it. */
  currency?: string;
  jars: Jar[];
};

/** What has arrived so far, and whether it is enough to restore. */
export type TransferAssembly = {
  /** Total frames the sender announced. */
  total: number;
  /** Frame indexes already collected, ascending. */
  have: number[];
  /** Frame indexes still needed, ascending. Empty once complete. */
  missing: number[];
  /** Frames that arrived more than once. Harmless, reported for honesty. */
  duplicates: number;
  /** The snapshot, present only once every frame has arrived and parses. */
  snapshot?: TransferSnapshot;
  /** Set when the payload decoded but is not a transfer this build understands. */
  error?: string;
};

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Entries are the bulk of a snapshot, so they travel as tuples rather than
 * objects: [amount, deposit flag, timestamp, note?, recurring flag?]. Trailing
 * absent fields are omitted rather than sent as null.
 */
// Optional tuple slots have to be spelled `T | undefined` rather than `T?`: a
// trailing `?` is not valid TypeScript when the element type is a union.
type WireEntry = [
  number,
  0 | 1,
  string,
  (string | null | undefined)?,
  (0 | 1 | null | undefined)?,
  (string | null | undefined)?,
  (EntryRevision[] | null | undefined)?,
  (string | null | undefined)?,
];

type WireRecurring = { am: number; cd: Cadence; pa: 0 | 1; nd?: string };

type WireJar = {
  i: string;
  n: string;
  t: number;
  b: number;
  ob?: number;
  a: Accent;
  c: string;
  ca?: string;
  k: JarKind;
  /** deadline */
  d?: string;
  /** habit streak */
  st?: number;
  /** last deposit timestamp */
  l?: string;
  /** milestones already celebrated */
  h?: number[];
  /** archived */
  x?: boolean;
  r?: WireRecurring;
  rm?: JarReminder;
  e: WireEntry[];
};

type WireSnapshot = {
  v: number;
  at: string;
  cur?: string;
  jars: WireJar[];
};

/* -------------------------------------------------------------------------- */
/* Encoding                                                                    */
/* -------------------------------------------------------------------------- */

function entryToWire(entry: Entry): WireEntry {
  // Built as a plain array first: annotating a literal this long as a tuple
  // makes every trailing optional slot a separate assignability complaint.
  const wire: unknown[] = [
    entry.amount,
    entry.direction === "deposit" ? 1 : 0,
    entry.at,
  ];
  if (entry.note) wire[3] = entry.note;
  if (entry.source === "recurring") wire[4] = 1;
  wire[5] = entry.id;
  if (entry.revisions?.length) wire[6] = entry.revisions;
  if (entry.undoOf) wire[7] = entry.undoOf;
  return wire as WireEntry;
}

function entryFromWire(wire: WireEntry, jarId: string, index: number): Entry {
  const [amount, direction, at, note, source, id, revisions, undoOf] = wire;
  return {
    // Preserve audit links; legacy tuples without IDs get stable jar-local IDs.
    id: id ?? `${jarId}-t${index}`,
    amount: Number.isFinite(amount) ? amount : 0,
    direction: direction === 1 ? "deposit" : "withdrawal",
    note: note ?? undefined,
    at,
    source: source === 1 ? "recurring" : "manual",
    revisions: revisions ?? undefined,
    undoOf: undoOf ?? undefined,
  };
}

function jarToWire(jar: Jar): WireJar {
  const wire: WireJar = {
    i: jar.id,
    n: jar.name,
    t: jar.target,
    b: jar.balance,
    a: jar.accent,
    c: jar.icon,
    ca: jar.createdAt,
    k: jar.kind,
    e: jar.entries.map(entryToWire),
  };
  if (jar.deadline) wire.d = jar.deadline;
  if (typeof jar.streak === "number") wire.st = jar.streak;
  if (jar.lastDepositAt) wire.l = jar.lastDepositAt;
  if (jar.milestonesHit?.length) wire.h = jar.milestonesHit;
  if (jar.archived) wire.x = true;
  if (jar.openingBalance !== undefined) wire.ob = jar.openingBalance;
  if (jar.reminder) wire.rm = jar.reminder;
  if (jar.recurring) {
    wire.r = {
      am: jar.recurring.amount,
      cd: jar.recurring.cadence,
      pa: jar.recurring.paused ? 1 : 0,
      nd: jar.recurring.nextDate,
    };
  }
  return wire;
}

function jarFromWire(wire: WireJar, exportedAt: string): Jar {
  return {
    id: wire.i,
    name: wire.n,
    target: wire.t,
    balance: wire.b,
    openingBalance: wire.ob ?? (wire.e.length === 0 ? wire.b : 0),
    accent: wire.a,
    icon: wire.c,
    kind: wire.k,
    createdAt: wire.ca ?? exportedAt,
    deadline: wire.d,
    streak: wire.st,
    lastDepositAt: wire.l,
    milestonesHit: wire.h ?? [],
    archived: wire.x === true,
    reminder: wire.rm,
    recurring: wire.r
      ? {
          amount: wire.r.am,
          cadence: wire.r.cd,
          paused: wire.r.pa === 1,
          nextDate: wire.r.nd,
        }
      : undefined,
    entries: (wire.e ?? []).map((entry, index) =>
      entryFromWire(entry, wire.i, index),
    ),
  };
}

/**
 * Split a snapshot into scannable frames. Frames are self-describing, so the
 * receiver can collect them in any order and can be told exactly which ones it
 * is still missing instead of starting over.
 */
export function encodeTransferFrames(snapshot: TransferSnapshot): string[] {
  const wire: WireSnapshot = {
    v: snapshot.version,
    at: snapshot.exportedAt,
    cur: snapshot.currency,
    jars: snapshot.jars.map(jarToWire),
  };
  const payload = bytesToBase64Url(utf8Encode(JSON.stringify(wire)));

  const chunks: string[] = [];
  for (
    let offset = 0;
    offset < payload.length;
    offset += TRANSFER_CHUNK_CHARS
  ) {
    chunks.push(payload.slice(offset, offset + TRANSFER_CHUNK_CHARS));
  }
  // A snapshot with no jars still produces one frame, so a receiver always has
  // something to scan and never has to special-case an empty transfer.
  if (chunks.length === 0) chunks.push("");

  const id = randomTransferId();
  const total = chunks.length;
  return chunks.map(
    (chunk, index) => `${TRANSFER_PREFIX}.${id}.${index + 1}.${total}.${chunk}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Decoding                                                                    */
/* -------------------------------------------------------------------------- */

export const MAX_TRANSFER_FRAMES = 1024;
export const MAX_TRANSFER_FRAME_LENGTH = TRANSFER_CHUNK_CHARS + 32;
const MAX_TRANSFER_JARS = 100;
const MAX_ENTRIES_PER_JAR = 20_000;
const MAX_TRANSFER_ENTRIES = 50_000;

function parseFrame(
  frame: string,
): { id: string; index: number; total: number; payload: string } | undefined {
  if (frame.length > MAX_TRANSFER_FRAME_LENGTH) return undefined;
  const text = frame.trim();
  if (!text.startsWith(`${TRANSFER_PREFIX}.`)) return undefined;
  const parts = text.split(".");
  if (parts.length < 5) return undefined;
  const index = Number(parts[2]);
  const total = Number(parts[3]);
  if (!/^[A-Za-z0-9_-]{6}$/.test(parts[1])) return undefined;
  if (!Number.isInteger(index) || !Number.isInteger(total)) return undefined;
  if (
    index < 1 ||
    total < 1 ||
    total > MAX_TRANSFER_FRAMES ||
    index > total ||
    parts.slice(4).join(".").length > TRANSFER_CHUNK_CHARS
  )
    return undefined;
  // base64url never contains a period, so this is purely defensive.
  return { id: parts[1], index, total, payload: parts.slice(4).join(".") };
}

function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isWireJar(value: unknown): value is WireJar {
  if (!value || typeof value !== "object") return false;
  const jar = value as Partial<WireJar>;
  if (
    typeof jar.i !== "string" ||
    !jar.i ||
    jar.i.length > 128 ||
    typeof jar.n !== "string" ||
    !jar.n.trim() ||
    jar.n.length > 120 ||
    !Number.isSafeInteger(jar.t) ||
    (jar.t ?? 0) <= 0 ||
    !Number.isSafeInteger(jar.b) ||
    (jar.b ?? -1) < 0 ||
    (jar.ob !== undefined && (!Number.isSafeInteger(jar.ob) || jar.ob < 0)) ||
    !["coral", "amber", "mint", "ocean", "berry", "clay"].includes(
      jar.a as string,
    ) ||
    typeof jar.c !== "string" ||
    !jar.c ||
    jar.c.length > 64 ||
    (jar.k !== "goal" && jar.k !== "habit") ||
    !Array.isArray(jar.e) ||
    jar.e.length > MAX_ENTRIES_PER_JAR ||
    (jar.ca !== undefined && !validDate(jar.ca)) ||
    (jar.d !== undefined && !validDate(jar.d)) ||
    (jar.l !== undefined && !validDate(jar.l)) ||
    (jar.st !== undefined && (!Number.isSafeInteger(jar.st) || jar.st < 0)) ||
    (jar.x !== undefined && typeof jar.x !== "boolean")
  )
    return false;
  if (
    jar.h !== undefined &&
    (!Array.isArray(jar.h) || jar.h.some((n) => ![25, 50, 75, 100].includes(n)))
  )
    return false;
  if (jar.r !== undefined) {
    const rule = jar.r;
    if (
      !rule ||
      !Number.isSafeInteger(rule.am) ||
      rule.am <= 0 ||
      !["daily", "weekly", "biweekly", "monthly"].includes(rule.cd) ||
      (rule.pa !== 0 && rule.pa !== 1)
    )
      return false;
    if (rule.nd !== undefined && !validDate(rule.nd)) return false;
  }
  if (jar.rm !== undefined && !isValidJarReminder(jar.rm)) return false;
  return jar.e.every(
    (entry) =>
      Array.isArray(entry) &&
      entry.length >= 3 &&
      entry.length <= 8 &&
      Number.isSafeInteger(entry[0]) &&
      entry[0] > 0 &&
      (entry[1] === 0 || entry[1] === 1) &&
      validDate(entry[2]) &&
      (entry[3] == null ||
        (typeof entry[3] === "string" && entry[3].length <= 500)) &&
      (entry[4] == null || entry[4] === 0 || entry[4] === 1) &&
      (entry[5] == null ||
        (typeof entry[5] === "string" &&
          entry[5].length > 0 &&
          entry[5].length <= 256)) &&
      (entry[6] == null ||
        (Array.isArray(entry[6]) &&
          entry[6].length <= 1000 &&
          entry[6].every(isValidEntryRevision))) &&
      (entry[7] == null ||
        (typeof entry[7] === "string" &&
          entry[7].length > 0 &&
          entry[7].length <= 256)),
  );
}

/**
 * Reassemble whatever frames have been scanned so far. Returns undefined only
 * when none of the input was a frame at all; a partial transfer comes back as
 * an assembly with `missing` populated, which is what the scan screen shows.
 */
export function decodeTransferFrames(
  frames: string[],
): TransferAssembly | undefined {
  if (frames.length > MAX_TRANSFER_FRAMES)
    return {
      total: 0,
      have: [],
      missing: [],
      duplicates: 0,
      error: "That transfer contains too many codes.",
    };
  const collected = new Map<number, string>();
  let total = 0;
  let duplicates = 0;
  let transferId: string | undefined;

  for (const frame of frames) {
    const parsed = parseFrame(frame);
    if (!parsed) continue;
    if (
      (transferId !== undefined && transferId !== parsed.id) ||
      (total !== 0 && total !== parsed.total)
    )
      return {
        total,
        have: [...collected.keys()].sort((a, b) => a - b),
        missing: [],
        duplicates,
        error: "These codes come from different transfers.",
      };
    transferId = parsed.id;
    total = parsed.total;
    if (collected.has(parsed.index)) {
      duplicates += 1;
      if (collected.get(parsed.index) !== parsed.payload)
        return {
          total,
          have: [...collected.keys()].sort((a, b) => a - b),
          missing: [],
          duplicates,
          error: "A repeated code does not match the earlier code.",
        };
      continue;
    }
    collected.set(parsed.index, parsed.payload);
  }

  if (total === 0) return undefined;

  const have = [...collected.keys()].sort((a, b) => a - b);
  const missing: number[] = [];
  for (let index = 1; index <= total; index += 1) {
    if (!collected.has(index)) missing.push(index);
  }

  const assembly: TransferAssembly = { total, have, missing, duplicates };
  if (missing.length > 0) return assembly;

  const payload = have.map((index) => collected.get(index) ?? "").join("");
  const bytes = base64UrlToBytes(payload);
  if (!bytes) {
    assembly.error = "That code did not decode.";
    return assembly;
  }

  try {
    const wire: unknown = JSON.parse(utf8Decode(bytes));
    if (!wire || typeof wire !== "object") {
      assembly.error = "That code is not a Saving Jar transfer.";
      return assembly;
    }
    const snapshot = wire as Partial<WireSnapshot>;
    if (
      !Number.isInteger(snapshot.v) ||
      !validDate(snapshot.at) ||
      !Array.isArray(snapshot.jars) ||
      snapshot.jars.length > MAX_TRANSFER_JARS ||
      (snapshot.cur !== undefined &&
        (typeof snapshot.cur !== "string" || !/^[A-Z]{3}$/.test(snapshot.cur)))
    ) {
      assembly.error = "That transfer contains invalid data.";
      return assembly;
    }
    if (snapshot.v! > TRANSFER_VERSION) {
      assembly.error = "That transfer came from a newer version of the app.";
      return assembly;
    }
    if (
      (snapshot.v !== 1 && snapshot.v !== TRANSFER_VERSION) ||
      snapshot.jars.some((jar) => !isWireJar(jar))
    ) {
      assembly.error = "That transfer contains invalid jar data.";
      return assembly;
    }
    const typedJars = snapshot.jars as WireJar[];
    if (
      new Set(typedJars.map((jar) => jar.i)).size !== typedJars.length ||
      typedJars.reduce((totalEntries, jar) => totalEntries + jar.e.length, 0) >
        MAX_TRANSFER_ENTRIES
    ) {
      assembly.error =
        "That transfer contains duplicate or excessive jar history.";
      return assembly;
    }
    const jars = typedJars.map((jar) => jarFromWire(jar, snapshot.at!));
    if (jars.some((jar) => !validEntryAudit(jar.entries))) {
      assembly.error =
        "That transfer contains invalid correction or Undo history.";
      return assembly;
    }
    assembly.snapshot = {
      version: snapshot.v,
      exportedAt: snapshot.at,
      currency: snapshot.cur,
      jars,
    };
  } catch {
    assembly.error = "That code could not be read.";
  }

  return assembly;
}

/* -------------------------------------------------------------------------- */
/* Byte plumbing                                                               */
/* -------------------------------------------------------------------------- */

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const B64_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let index = 0; index < B64_ALPHABET.length; index += 1) {
    table[B64_ALPHABET[index]] = index;
  }
  return table;
})();

function bytesToBase64Url(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64_ALPHABET[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64_ALPHABET[b2 & 0b111111];
  }
  return out;
}

function base64UrlToBytes(text: string): number[] | undefined {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = B64_LOOKUP[char];
    if (value === undefined) return undefined;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i];
    let code: number;
    let size: number;
    if (b0 < 0x80) {
      code = b0;
      size = 1;
    } else if ((b0 & 0xe0) === 0xc0) {
      code = b0 & 0x1f;
      size = 2;
    } else if ((b0 & 0xf0) === 0xe0) {
      code = b0 & 0x0f;
      size = 3;
    } else if ((b0 & 0xf8) === 0xf0) {
      code = b0 & 0x07;
      size = 4;
    } else {
      code = 0xfffd;
      size = 1;
    }
    if (size > 1) {
      for (let offset = 1; offset < size; offset += 1) {
        const next = bytes[i + offset];
        if (next === undefined || (next & 0xc0) !== 0x80) {
          code = 0xfffd;
          size = offset;
          break;
        }
        code = (code << 6) | (next & 0x3f);
      }
    }
    out += String.fromCodePoint(code);
    i += size;
  }
  return out;
}

function randomTransferId(): string {
  let out = "";
  for (let index = 0; index < 6; index += 1) {
    out += B64_ALPHABET[Math.floor(Math.random() * B64_ALPHABET.length)];
  }
  return out;
}
