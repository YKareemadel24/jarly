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
 *
 * Shared jars are deliberately excluded from a transfer. They are
 * server-authoritative and every member already sees them by signing in, so
 * copying one to another device would create a stale second copy of a balance
 * the server owns.
 */

import type { Accent, Cadence, Entry, Jar, JarKind } from "../lib/savings-core";

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
export const TRANSFER_VERSION = 1;

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
type WireEntry = [number, 0 | 1, string, (string | undefined)?, (0 | 1 | undefined)?];

type WireRecurring = { am: number; cd: Cadence; pa: 0 | 1; nd?: string };

type WireJar = {
  i: string;
  n: string;
  t: number;
  b: number;
  a: Accent;
  c: string;
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
  const wire: (number | string | undefined)[] = [entry.amount, entry.direction === "deposit" ? 1 : 0, entry.at];
  if (entry.note) wire[3] = entry.note;
  if (entry.source === "recurring") wire[4] = 1;
  return wire as WireEntry;
}

function entryFromWire(wire: WireEntry, jarId: string, index: number): Entry {
  const [amount, direction, at, note, source] = wire;
  return {
    // Entry ids are only unique within a jar, and a transfer is the one moment
    // where two devices' ids could collide, so rebuild them from the jar id.
    id: `${jarId}-t${index}`,
    amount: Number.isFinite(amount) ? amount : 0,
    direction: direction === 1 ? "deposit" : "withdrawal",
    note,
    at,
    source: source === 1 ? "recurring" : "manual",
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
    k: jar.kind,
    e: jar.entries.map(entryToWire),
  };
  if (jar.deadline) wire.d = jar.deadline;
  if (typeof jar.streak === "number") wire.st = jar.streak;
  if (jar.lastDepositAt) wire.l = jar.lastDepositAt;
  if (jar.milestonesHit?.length) wire.h = jar.milestonesHit;
  if (jar.archived) wire.x = true;
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

function jarFromWire(wire: WireJar): Jar {
  return {
    id: wire.i,
    name: wire.n,
    target: wire.t,
    balance: wire.b,
    accent: wire.a,
    icon: wire.c,
    kind: wire.k,
    createdAt: new Date().toISOString(),
    deadline: wire.d,
    streak: wire.st,
    lastDepositAt: wire.l,
    milestonesHit: wire.h ?? [],
    archived: wire.x === true,
    recurring: wire.r
      ? { amount: wire.r.am, cadence: wire.r.cd, paused: wire.r.pa === 1, nextDate: wire.r.nd }
      : undefined,
    entries: (wire.e ?? []).map((entry, index) => entryFromWire(entry, wire.i, index)),
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
  for (let offset = 0; offset < payload.length; offset += TRANSFER_CHUNK_CHARS) {
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

function parseFrame(frame: string): { index: number; total: number; payload: string } | undefined {
  const text = frame.trim();
  if (!text.startsWith(`${TRANSFER_PREFIX}.`)) return undefined;
  const parts = text.split(".");
  if (parts.length < 5) return undefined;
  const index = Number(parts[2]);
  const total = Number(parts[3]);
  if (!Number.isInteger(index) || !Number.isInteger(total)) return undefined;
  if (index < 1 || total < 1 || index > total) return undefined;
  // base64url never contains a period, so this is purely defensive.
  return { index, total, payload: parts.slice(4).join(".") };
}

/**
 * Reassemble whatever frames have been scanned so far. Returns undefined only
 * when none of the input was a frame at all; a partial transfer comes back as
 * an assembly with `missing` populated, which is what the scan screen shows.
 */
export function decodeTransferFrames(frames: string[]): TransferAssembly | undefined {
  const collected = new Map<number, string>();
  let total = 0;
  let duplicates = 0;

  for (const frame of frames) {
    const parsed = parseFrame(frame);
    if (!parsed) continue;
    total = Math.max(total, parsed.total);
    if (collected.has(parsed.index)) {
      duplicates += 1;
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
    const wire = JSON.parse(utf8Decode(bytes)) as WireSnapshot;
    if (typeof wire?.v !== "number" || !Array.isArray(wire.jars)) {
      assembly.error = "That code is not a Saving Jar transfer.";
      return assembly;
    }
    if (wire.v > TRANSFER_VERSION) {
      assembly.error = "That transfer came from a newer version of the app.";
      return assembly;
    }
    assembly.snapshot = {
      version: wire.v,
      exportedAt: wire.at,
      currency: wire.cur,
      jars: wire.jars.map(jarFromWire),
    };
  } catch {
    assembly.error = "That code could not be read.";
  }

  return assembly;
}

/* -------------------------------------------------------------------------- */
/* Byte plumbing                                                               */
/* -------------------------------------------------------------------------- */

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
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