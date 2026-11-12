/// Transaction corrections, undo, and ledger validation.
library;

import 'insights.dart';
import 'jar.dart';
import 'reminder.dart';

import 'time.dart';
import 'util.dart';

/// JSON may decode an integer as a double. Check the bound before converting.
bool isSafeJsonInteger(Object? value) =>
    value is num &&
    value >= -maxSafeInteger &&
    value <= maxSafeInteger &&
    value == value.truncate();

/// Exact active total, or null when any addition would exceed the safe range.
int? safeActiveSavingsTotal(Iterable<Jar> jars) {
  var total = 0;
  for (final jar in jars) {
    if (jar.isArchived) continue;
    if (!isSafeInteger(jar.balance) ||
        jar.balance < 0 ||
        jar.balance > maxSafeInteger - total) {
      return null;
    }
    total += jar.balance;
  }
  return total;
}

/// Shared money and ledger invariants for storage and imported jars.
bool validLedgerJar(Jar jar) =>
    isSafeInteger(jar.target) &&
    jar.target > 0 &&
    (jar.recurring == null ||
        (isSafeInteger(jar.recurring!.amount) && jar.recurring!.amount > 0)) &&
    (jar.reminder == null || isValidJarReminder(jar.reminder)) &&
    validEntryAudit(jar.entries) &&
    validTransactionHistory(jar);

bool validLedgerSnapshot(List<Jar> jars) =>
    jars.map((jar) => jar.id).toSet().length == jars.length &&
    safeActiveSavingsTotal(jars) != null &&
    jars.every(validLedgerJar);

class EntryCorrection {
  const EntryCorrection({required this.amount, required this.at, this.note});
  final int amount;
  final String at;
  final String? note;
}

/// A string that parses to a real date and whose first 10 characters already
/// pin down a real calendar day (rejects e.g. "2026-13-45T…").
bool validDate(String? value) {
  if (value == null || value.length > 40) return false;
  if (DateTime.tryParse(value) == null) return false;
  final prefix = value.length > 10 ? value.substring(0, 10) : value;
  return parseDeadline(prefix) != null;
}

bool isValidEntryRevision(Object? value) {
  if (value is! EntryRevision) return false;
  final revision = value;
  return isSafeInteger(revision.amount) &&
      revision.amount > 0 &&
      validDate(revision.at) &&
      validDate(revision.changedAt) &&
      (revision.note == null ||
          (revision.note is String && revision.note!.length <= 500));
}

/// Validate the whole undo/correction web: unique ids, no double-undo,
/// compensating entries point at a genuine opposite-direction original of the
/// same amount, and chronology runs forward.
bool validEntryAudit(List<Entry> entries) {
  final byId = {for (final entry in entries) entry.id: entry};
  if (byId.length != entries.length) return false;
  final reversed = <String>{};
  for (final entry in entries) {
    if (entry.id.isEmpty ||
        entry.id.length > 256 ||
        (entry.revisions != null &&
            (entry.revisions!.length > 1000 ||
                !entry.revisions!.every(isValidEntryRevision)))) {
      return false;
    }
    if (entry.undoOf == null) continue;
    if (reversed.contains(entry.undoOf)) return false;
    final original = byId[entry.undoOf];
    if (original == null ||
        original.undoOf != null ||
        original.id == entry.id ||
        original.amount != entry.amount ||
        original.direction == entry.direction) {
      return false;
    }
    // NaN semantics: unparseable timestamps simply never read as "newer".
    final originalMs = DateTime.tryParse(original.at)?.millisecondsSinceEpoch;
    final entryMs = DateTime.tryParse(entry.at)?.millisecondsSinceEpoch;
    if (originalMs != null && entryMs != null && originalMs > entryMs) {
      return false;
    }
    reversed.add(entry.undoOf!);
  }
  return true;
}

/// Recompute a habit jar's streak and last deposit from its effective ledger.
Jar withHabitHistory(Jar jar) {
  if (jar.kind != kindHabit) return jar;
  final deposits = effectiveEntries(jar.entries)
      .where((entry) => entry.direction == directionDeposit)
      .toList();
  final days = {
    for (final entry in deposits) calendarDayNumber(parseIso(entry.at)),
  };
  var streak = 0;
  Entry? latest;
  for (final entry in deposits) {
    if (latest == null ||
        parseIso(entry.at).millisecondsSinceEpoch >
            parseIso(latest.at).millisecondsSinceEpoch) {
      latest = entry;
    }
  }
  if (latest != null) {
    var day = calendarDayNumber(parseIso(latest.at));
    while (days.contains(day)) {
      streak += 1;
      day -= 1;
    }
  }
  return jar.copyWith(streak: streak, lastDepositAt: latest?.at);
}

/// Keep the original opening balance and ensure every historical withdrawal
/// remains funded: replay the whole ledger with BigInt arithmetic.
bool validTransactionHistory(Jar jar, [List<Entry>? entriesParam]) {
  final entries = entriesParam ?? jar.entries;
  final maximum = BigInt.from(maxSafeInteger);
  if (!isSafeInteger(jar.balance) ||
      jar.balance < 0 ||
      jar.entries.any(
        (entry) =>
            !isSafeInteger(entry.amount) ||
            entry.amount <= 0 ||
            !validDate(entry.at) ||
            (entry.direction != directionDeposit &&
                entry.direction != directionWithdrawal),
      )) {
    return false;
  }
  var balance = BigInt.from(jar.balance);
  // Ledger is stored newest first; walking it reconstructs the opening balance.
  for (final entry in jar.entries) {
    final signed =
        BigInt.from(entry.amount) *
        (entry.direction == directionDeposit ? BigInt.one : BigInt.from(-1));
    balance -= signed;
  }
  if (balance < BigInt.zero || balance > maximum) return false;
  if (jar.openingBalance != null &&
      (!isSafeInteger(jar.openingBalance!) ||
          jar.openingBalance! < 0 ||
          BigInt.from(jar.openingBalance!) != balance)) {
    return false;
  }
  // Chronological replay must never dip below zero or overflow.
  final chronological = sortedStable(entries.reversed.toList(), (a, b) {
    final atA = DateTime.parse(a.at).millisecondsSinceEpoch;
    final atB = DateTime.parse(b.at).millisecondsSinceEpoch;
    return atA.compareTo(atB);
  });
  for (final entry in chronological) {
    final signed =
        BigInt.from(entry.amount) *
        (entry.direction == directionDeposit ? BigInt.one : BigInt.from(-1));
    balance += signed;
    if (balance < BigInt.zero || balance > maximum) return false;
  }
  return true;
}

/// Correct an entry in place, appending a revision and re-validating history.
/// Returns null when the correction is invalid; returns [jar] unchanged when
/// nothing differs.
Jar? correctEntry(
  Jar jar,
  String entryId,
  EntryCorrection input, [
  DateTime? now,
]) {
  final nowDate = now ?? DateTime.now();
  final index = jar.entries.indexWhere((item) => item.id == entryId);
  if (index < 0) return null;
  final entry = jar.entries[index];
  if (entry.undoOf != null ||
      jar.entries.any((item) => item.undoOf == entryId) ||
      (entry.revisions?.length ?? 0) >= 1000 ||
      !isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      !validDate(input.at) ||
      DateTime.parse(input.at).millisecondsSinceEpoch >
          nowDate.millisecondsSinceEpoch ||
      (input.note != null && input.note!.length > 500)) {
    return null;
  }
  final at = toIso(DateTime.parse(input.at).toLocal());
  final trimmed = input.note?.trim();
  final note = trimmed == null || trimmed.isEmpty ? null : trimmed;
  if (entry.amount == input.amount &&
      DateTime.parse(entry.at).millisecondsSinceEpoch ==
          DateTime.parse(at).millisecondsSinceEpoch &&
      entry.note == note) {
    return jar;
  }
  final balance =
      jar.balance +
      (input.amount - entry.amount) *
          (entry.direction == directionDeposit ? 1 : -1);
  if (!isSafeInteger(balance) || balance < 0) return null;

  final updatedEntry = entry.copyWith(
    amount: input.amount,
    at: at,
    note: note,
    revisions: [
      ...(entry.revisions ?? const <EntryRevision>[]),
      EntryRevision(
        amount: entry.amount,
        at: entry.at,
        note: entry.note,
        changedAt: toIso(nowDate),
      ),
    ],
  );
  final entries = [
    for (final item in jar.entries)
      if (item.id == entryId) updatedEntry else item,
  ];
  stableSort(entries, (a, b) {
    final atA = DateTime.parse(a.at).millisecondsSinceEpoch;
    final atB = DateTime.parse(b.at).millisecondsSinceEpoch;
    return atB.compareTo(atA);
  });
  if (!validTransactionHistory(jar, entries)) return null;
  return withHabitHistory(jar.copyWith(balance: balance, entries: entries));
}

/// Reverse an entry with a compensating opposite-direction entry linked via
/// `undoOf`. The ledger keeps the full audit trail; stats filter both sides.
Jar? undoEntry(Jar jar, String entryId, [DateTime? now]) {
  final nowDate = now ?? DateTime.now();
  final entry = jar.entries.where((item) => item.id == entryId).firstOrNull;
  if (entry == null ||
      entry.undoOf != null ||
      !validDate(entry.at) ||
      DateTime.parse(entry.at).millisecondsSinceEpoch >
          nowDate.millisecondsSinceEpoch ||
      jar.entries.any((item) => item.undoOf == entryId)) {
    return null;
  }
  final applied = applyEntry(
    jar,
    entry.amount,
    entry.direction == directionDeposit
        ? directionWithdrawal
        : directionDeposit,
    note: entry.direction == directionDeposit
        ? 'Deposit undone'
        : 'Withdrawal undone',
    source: sourceManual,
    now: nowDate,
  );
  if (applied == null) return null;
  final entries = [
    for (var i = 0; i < applied.jar.entries.length; i++)
      if (i == 0)
        applied.jar.entries[i].copyWith(undoOf: entryId)
      else
        applied.jar.entries[i],
  ];
  if (!validTransactionHistory(applied.jar, entries)) return null;
  return withHabitHistory(
    applied.jar.copyWith(entries: entries, milestonesHit: jar.milestonesHit),
  );
}
