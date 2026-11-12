/// Device-to-device transfer codec.
///
/// Moving jars to a new phone must not require an account, a server, or a
/// cable. The sending device renders a snapshot as a sequence of QR codes; the
/// receiving device collects them in any order. The wire format therefore has
/// to survive being read by a camera: base64url only, no whitespace, and every
/// frame carries enough header to be reassembled out of order or after a
/// double scan.
///
/// A faithful port of `shared/transfer.ts` — frames produced or consumed by
/// either app are interchangeable.
library;

import 'dart:convert';
import 'dart:math';

import '../domain/jar.dart';
import '../domain/reminder.dart';

import '../domain/transactions.dart';

/// Marker every frame starts with. Bumping it is a breaking format change.
const String transferPrefix = 'JARLY1';

/// Characters of payload per frame. Sized for a phone camera held at arm's
/// length, not for the theoretical limit of a QR code.
const int transferChunkChars = 400;

/// Payload version this build writes.
const int transferVersion = 2;

class TransferSnapshot {
  const TransferSnapshot({
    required this.version,
    required this.exportedAt,
    this.currency,
    required this.jars,
  });

  final int version;
  final String exportedAt;

  /// Currency the amounts are denominated in, so the receiver can confirm it.
  final String? currency;
  final List<Jar> jars;
}

/// What has arrived so far, and whether it is enough to restore.
class TransferAssembly {
  TransferAssembly({
    required this.total,
    required this.have,
    required this.missing,
    required this.duplicates,
    this.snapshot,
    this.error,
  });

  /// Total frames the sender announced.
  final int total;

  /// Frame indexes already collected, ascending.
  final List<int> have;

  /// Frame indexes still needed, ascending. Empty once complete.
  final List<int> missing;

  /// Frames that arrived more than once. Harmless, reported for honesty.
  final int duplicates;

  /// The snapshot, present only once every frame has arrived and parses.
  TransferSnapshot? snapshot;

  /// Set when the payload decoded but is not a transfer this build understands.
  String? error;
}

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

/// Entries travel as tuples rather than objects:
/// [amount, deposit flag, timestamp, note?, recurring flag?, id?, revisions?, undoOf?]
/// Middle slots the sender skips become explicit nulls, exactly as
/// JSON.stringify rendered the original app's sparse arrays.
List<Object?> entryToWire(Entry entry) {
  final wire = <Object?>[
    entry.amount,
    entry.direction == directionDeposit ? 1 : 0,
    entry.at,
  ];
  // Slots skipped by the sender still exist as nulls — JSON.stringify turned
  // the original sparse array's holes into explicit nulls.
  wire.add(entry.note);
  wire.add(entry.source == sourceRecurring ? 1 : null);
  wire.add(entry.id);
  void put(int index, Object? value) {
    while (wire.length < index) {
      wire.add(null);
    }
    if (index < wire.length) {
      wire[index] = value;
    } else {
      wire.add(value);
    }
  }

  if (entry.revisions != null && entry.revisions!.isNotEmpty) {
    put(6, entry.revisions!.map((r) => r.toJson()).toList());
  }
  if (entry.undoOf != null) put(7, entry.undoOf);
  return wire;
}

Entry entryFromWire(List<dynamic> wire, String jarId, int index) {
  Object? slot(int i) => i < wire.length ? wire[i] : null;
  return Entry(
    // Preserve audit links; legacy tuples without IDs get stable jar-local IDs.
    id: (slot(5) as String?) ?? '$jarId-t$index',
    amount: (slot(0) as num?)?.toInt() ?? 0,
    direction: (slot(1) as num?)?.toInt() == 1
        ? directionDeposit
        : directionWithdrawal,
    note: slot(3) as String?,
    at: slot(2) as String? ?? '',
    source: (slot(4) as num?)?.toInt() == 1 ? sourceRecurring : sourceManual,
    revisions: (slot(6) as List?)
        ?.whereType<Map>()
        .map((value) => EntryRevision.fromJson(value.cast<String, dynamic>()))
        .toList(),
    undoOf: slot(7) as String?,
  );
}

Map<String, dynamic> jarToWire(Jar jar) {
  final wire = <String, dynamic>{
    'i': jar.id,
    'n': jar.name,
    't': jar.target,
    'b': jar.balance,
    'a': jar.accent,
    'c': jar.icon,
    'ca': jar.createdAt,
    'k': jar.kind,
    'e': jar.entries.map(entryToWire).toList(),
  };
  if (jar.deadline != null) wire['d'] = jar.deadline;
  if (jar.streak != null) wire['st'] = jar.streak;
  if (jar.lastDepositAt != null) wire['l'] = jar.lastDepositAt;
  if (jar.milestonesHit.isNotEmpty) wire['h'] = jar.milestonesHit;
  if (jar.isArchived) wire['x'] = true;
  if (jar.openingBalance != null) wire['ob'] = jar.openingBalance;
  if (jar.reminder != null) wire['rm'] = jar.reminder!.toJson();
  if (jar.recurring != null) {
    wire['r'] = {
      'am': jar.recurring!.amount,
      'cd': jar.recurring!.cadence,
      'pa': jar.recurring!.paused ? 1 : 0,
      if (jar.recurring!.nextDate != null) 'nd': jar.recurring!.nextDate,
    };
  }
  return wire;
}

Jar jarFromWire(Map<String, dynamic> wire, String exportedAt) {
  final entries = ((wire['e'] as List?) ?? const []).whereType<List>().toList();
  final recurring = wire['r'];
  final balance = (wire['b'] as num?)?.toInt() ?? 0;
  return Jar(
    id: wire['i'] as String? ?? '',
    name: wire['n'] as String? ?? '',
    target: (wire['t'] as num?)?.toInt() ?? 0,
    balance: balance,
    openingBalance:
        (wire['ob'] as num?)?.toInt() ?? (entries.isEmpty ? balance : 0),
    accent: wire['a'] as String? ?? 'ocean',
    icon: wire['c'] as String? ?? '🫙',
    kind: wire['k'] as String? ?? kindGoal,
    createdAt: (wire['ca'] as String?) ?? exportedAt,
    deadline: wire['d'] as String?,
    streak: (wire['st'] as num?)?.toInt(),
    lastDepositAt: wire['l'] as String?,
    milestonesHit: ((wire['h'] as List?) ?? const [])
        .map((value) => (value as num).toInt())
        .toList(),
    archived: wire['x'] == true,
    reminder: wire['rm'] is Map
        ? JarReminder.fromJson((wire['rm'] as Map).cast<String, dynamic>())
        : null,
    recurring: recurring is Map
        ? RecurringRule(
            amount: (recurring['am'] as num?)?.toInt() ?? 0,
            cadence: recurring['cd'] as String? ?? 'weekly',
            paused: recurring['pa'] == 1,
            nextDate: recurring['nd'] as String?,
          )
        : null,
    entries: [
      for (var index = 0; index < entries.length; index++)
        entryFromWire(entries[index], wire['i'] as String? ?? '', index),
    ],
  );
}

/* -------------------------------------------------------------------------- */
/* Encoding                                                                    */
/* -------------------------------------------------------------------------- */

/// Split a snapshot into scannable frames. Frames are self-describing, so the
/// receiver can collect them in any order and can be told exactly which ones
/// it is still missing instead of starting over.
List<String> encodeTransferFrames(TransferSnapshot snapshot) {
  final wire = <String, dynamic>{
    'v': snapshot.version,
    'at': snapshot.exportedAt,
    if (snapshot.currency != null) 'cur': snapshot.currency,
    'jars': snapshot.jars.map(jarToWire).toList(),
  };
  final payload = bytesToBase64Url(utf8.encode(jsonEncode(wire)));

  final chunks = <String>[];
  for (var offset = 0; offset < payload.length; offset += transferChunkChars) {
    final end = (offset + transferChunkChars).clamp(0, payload.length);
    chunks.add(payload.substring(offset, end));
  }
  // A snapshot with no jars still produces one frame, so a receiver always has
  // something to scan and never has to special-case an empty transfer.
  if (chunks.isEmpty) chunks.add('');

  final id = randomTransferId();
  final total = chunks.length;
  return [
    for (var index = 0; index < chunks.length; index++)
      '$transferPrefix.$id.${index + 1}.$total.${chunks[index]}',
  ];
}

/* -------------------------------------------------------------------------- */
/* Decoding                                                                    */
/* -------------------------------------------------------------------------- */

const int maxTransferFrames = 1024;
const int maxTransferFrameLength = transferChunkChars + 32;
const int _maxTransferJars = 100;
const int _maxEntriesPerJar = 20000;
const int _maxTransferEntries = 50000;

({String id, int index, int total, String payload})? _parseFrame(String frame) {
  if (frame.length > maxTransferFrameLength) return null;
  final text = frame.trim();
  if (!text.startsWith('$transferPrefix.')) return null;
  final parts = text.split('.');
  if (parts.length < 5) return null;
  final index = num.tryParse(parts[2]);
  final total = num.tryParse(parts[3]);
  if (!RegExp(r'^[A-Za-z0-9_-]{6}$').hasMatch(parts[1])) return null;
  bool whole(num? value) => value != null && value == value.truncateToDouble();
  if (!whole(index) || !whole(total)) return null;
  final payload = parts.sublist(4).join('.');
  if ((index as num).toInt() < 1 ||
      (total as num).toInt() < 1 ||
      total.toInt() > maxTransferFrames ||
      index.toInt() > total ||
      payload.length > transferChunkChars) {
    return null;
  }
  // base64url never contains a period, so this is purely defensive.
  return (
    id: parts[1],
    index: index.toInt(),
    total: total.toInt(),
    payload: payload,
  );
}

bool _validWireDate(Object? value) {
  if (value is! String || value.length > 40) return false;
  return DateTime.tryParse(value) != null;
}

bool _isValidRevisionJson(Object? value) {
  if (value is! Map) return false;
  final revision = value.cast<String, dynamic>();
  final amount = revision['amount'];
  return isSafeJsonInteger(amount) &&
      (amount as num) > 0 &&
      _validWireDate(revision['at']) &&
      _validWireDate(revision['changedAt']) &&
      (revision['note'] == null ||
          (revision['note'] is String &&
              (revision['note'] as String).length <= 500));
}

bool _isWireJar(Object? value) {
  if (value is! Map) return false;
  final jar = value.cast<String, dynamic>();
  final t = jar['t'];
  final b = jar['b'];
  final ob = jar['ob'];
  final st = jar['st'];
  if (jar['i'] is! String ||
      (jar['i'] as String).isEmpty ||
      (jar['i'] as String).length > 128 ||
      jar['n'] is! String ||
      (jar['n'] as String).trim().isEmpty ||
      (jar['n'] as String).length > 120 ||
      !isSafeJsonInteger(t) ||
      (t as num) <= 0 ||
      !isSafeJsonInteger(b) ||
      (b as num) < 0 ||
      (ob != null && (!isSafeJsonInteger(ob) || (ob as num) < 0)) ||
      ![
        'coral',
        'amber',
        'mint',
        'ocean',
        'berry',
        'clay',
      ].contains(jar['a']) ||
      jar['c'] is! String ||
      (jar['c'] as String).isEmpty ||
      (jar['c'] as String).length > 64 ||
      (jar['k'] != 'goal' && jar['k'] != 'habit') ||
      jar['e'] is! List ||
      (jar['e'] as List).length > _maxEntriesPerJar ||
      (jar['ca'] != null && !_validWireDate(jar['ca'])) ||
      (jar['d'] != null && !_validWireDate(jar['d'])) ||
      (jar['l'] != null && !_validWireDate(jar['l'])) ||
      (st != null && (!isSafeJsonInteger(st) || (st as num) < 0)) ||
      (jar['x'] != null && jar['x'] is! bool)) {
    return false;
  }
  final h = jar['h'];
  if (h != null &&
      (h is! List || h.any((n) => ![25, 50, 75, 100].contains(n)))) {
    return false;
  }
  final r = jar['r'];
  if (r != null) {
    if (r is! Map) return false;
    final rule = r.cast<String, dynamic>();
    final am = rule['am'];
    if (!isSafeJsonInteger(am) ||
        (am as num) <= 0 ||
        !['daily', 'weekly', 'biweekly', 'monthly'].contains(rule['cd']) ||
        (rule['pa'] != 0 && rule['pa'] != 1)) {
      return false;
    }
    if (rule['nd'] != null && !_validWireDate(rule['nd'])) return false;
  }
  if (jar['rm'] != null && !isValidJarReminder(jar['rm'])) return false;
  return (jar['e'] as List).every((entry) {
    if (entry is! List) return false;
    if (entry.length < 3 || entry.length > 8) return false;
    Object? slot(int i) => i < entry.length ? entry[i] : null;
    final amount = slot(0);
    final flag = slot(1);
    final note = slot(3);
    final source = slot(4);
    final id = slot(5);
    final revisions = slot(6);
    final undoOf = slot(7);
    return isSafeJsonInteger(amount) &&
        (amount as num) > 0 &&
        (flag == 0 || flag == 1) &&
        _validWireDate(slot(2)) &&
        (note == null || (note is String && note.length <= 500)) &&
        (source == null || source == 0 || source == 1) &&
        (id == null || (id is String && id.isNotEmpty && id.length <= 256)) &&
        (revisions == null ||
            (revisions is List &&
                revisions.length <= 1000 &&
                revisions.every(_isValidRevisionJson))) &&
        (undoOf == null ||
            (undoOf is String && undoOf.isNotEmpty && undoOf.length <= 256));
  });
}

/// Reassemble whatever frames have been scanned so far. Returns null only when
/// none of the input was a frame at all; a partial transfer comes back as an
/// assembly with `missing` populated, which is what the scan screen shows.
TransferAssembly? decodeTransferFrames(List<String> frames) {
  if (frames.length > maxTransferFrames) {
    return TransferAssembly(
      total: 0,
      have: [],
      missing: [],
      duplicates: 0,
      error: 'That transfer contains too many codes.',
    );
  }
  final collected = <int, String>{};
  var total = 0;
  var duplicates = 0;
  String? transferId;

  for (final frame in frames) {
    final parsed = _parseFrame(frame);
    if (parsed == null) continue;
    if ((transferId != null && transferId != parsed.id) ||
        (total != 0 && total != parsed.total)) {
      return TransferAssembly(
        total: total,
        have: collected.keys.toList()..sort(),
        missing: [],
        duplicates: duplicates,
        error: 'These codes come from different transfers.',
      );
    }
    transferId = parsed.id;
    total = parsed.total;
    if (collected.containsKey(parsed.index)) {
      duplicates += 1;
      if (collected[parsed.index] != parsed.payload) {
        return TransferAssembly(
          total: total,
          have: collected.keys.toList()..sort(),
          missing: [],
          duplicates: duplicates,
          error: 'A repeated code does not match the earlier code.',
        );
      }
      continue;
    }
    collected[parsed.index] = parsed.payload;
  }

  if (total == 0) return null;

  final have = collected.keys.toList()..sort();
  final missing = [
    for (var index = 1; index <= total; index++)
      if (!collected.containsKey(index)) index,
  ];

  final assembly = TransferAssembly(
    total: total,
    have: have,
    missing: missing,
    duplicates: duplicates,
  );
  if (missing.isNotEmpty) return assembly;

  final payload = [for (final index in have) collected[index] ?? ''].join('');
  final bytes = base64UrlToBytes(payload);
  if (bytes == null) {
    assembly.error = 'That code did not decode.';
    return assembly;
  }

  try {
    final dynamic decoded = jsonDecode(
      utf8.decode(bytes, allowMalformed: true),
    );
    if (decoded is! Map) {
      assembly.error = 'That code is not a Saving Jar transfer.';
      return assembly;
    }
    final snapshot = decoded.cast<String, dynamic>();
    final v = snapshot['v'];
    final cur = snapshot['cur'];
    final jarsRaw = snapshot['jars'];
    final wholeV = v is int || (v is double && v == v.truncateToDouble());
    if (!wholeV ||
        !_validWireDate(snapshot['at']) ||
        jarsRaw is! List ||
        jarsRaw.length > _maxTransferJars ||
        (cur != null &&
            (cur is! String || !RegExp(r'^[A-Z]{3}$').hasMatch(cur)))) {
      assembly.error = 'That transfer contains invalid data.';
      return assembly;
    }
    final version = (v as num).toInt();
    if (version > transferVersion) {
      assembly.error = 'That transfer came from a newer version of the app.';
      return assembly;
    }
    if ((version != 1 && version != transferVersion) ||
        jarsRaw.any((jar) => !_isWireJar(jar))) {
      assembly.error = 'That transfer contains invalid jar data.';
      return assembly;
    }
    final wireJars = jarsRaw
        .whereType<Map>()
        .map((jar) => jar.cast<String, dynamic>())
        .toList();
    final idSet = wireJars.map((jar) => jar['i']).toSet();
    final entryTotal = wireJars.fold<int>(
      0,
      (totalEntries, jar) =>
          totalEntries + ((jar['e'] as List?) ?? const []).length,
    );
    if (idSet.length != wireJars.length || entryTotal > _maxTransferEntries) {
      assembly.error =
          'That transfer contains duplicate or excessive jar history.';
      return assembly;
    }
    final jars = wireJars
        .map((jar) => jarFromWire(jar, snapshot['at'] as String))
        .toList();
    if (jars.any((jar) => !validEntryAudit(jar.entries))) {
      assembly.error =
          'That transfer contains invalid correction or Undo history.';
      return assembly;
    }
    assembly.snapshot = TransferSnapshot(
      version: version,
      exportedAt: snapshot['at'] as String,
      currency: cur as String?,
      jars: jars,
    );
  } catch (_) {
    assembly.error = 'That code could not be read.';
  }

  return assembly;
}

/* -------------------------------------------------------------------------- */
/* Byte plumbing                                                               */
/* -------------------------------------------------------------------------- */

const String _b64Alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

final Map<String, int> _b64Lookup = {
  for (var index = 0; index < _b64Alphabet.length; index++)
    _b64Alphabet[index]: index,
};

String bytesToBase64Url(List<int> bytes) {
  final out = StringBuffer();
  for (var i = 0; i < bytes.length; i += 3) {
    final b0 = bytes[i];
    final b1 = i + 1 < bytes.length ? bytes[i + 1] : null;
    final b2 = i + 2 < bytes.length ? bytes[i + 2] : null;
    out.write(_b64Alphabet[b0 >> 2]);
    out.write(_b64Alphabet[((b0 & 0x3) << 4) | ((b1 ?? 0) >> 4)]);
    if (b1 == null) break;
    out.write(_b64Alphabet[((b1 & 0xF) << 2) | ((b2 ?? 0) >> 6)]);
    if (b2 == null) break;
    out.write(_b64Alphabet[b2 & 0x3F]);
  }
  return out.toString();
}

List<int>? base64UrlToBytes(String text) {
  final bytes = <int>[];
  var buffer = 0;
  var bits = 0;
  for (final char in text.split('')) {
    final value = _b64Lookup[char];
    if (value == null) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.add((buffer >> bits) & 0xFF);
    }
  }
  return bytes;
}

String randomTransferId() {
  final random = Random();
  return String.fromCharCodes(
    List.generate(
      6,
      (_) => _b64Alphabet.codeUnitAt(random.nextInt(_b64Alphabet.length)),
    ),
  );
}
