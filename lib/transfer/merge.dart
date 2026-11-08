/// Merging incoming transfer jars into the local list.
///
/// Restores are additive and atomic: any conflict aborts the whole import with
/// no jars imported, rather than leaving a half-merged state behind.
library;

import '../domain/jar.dart';

import '../domain/transactions.dart';

Map<String, dynamic> _jarSettings(Jar jar) {
  final recurring = jar.recurring;
  final reminder = jar.reminder;
  final deadline = (jar.deadline == null || jar.deadline!.isEmpty) ? null : jar.deadline;
  return {
    'name': jar.name,
    'target': jar.target,
    'accent': jar.accent,
    'icon': jar.icon,
    'kind': jar.kind,
    'deadline': deadline,
    'recurring': recurring == null
        ? null
        : {
            'amount': recurring.amount,
            'cadence': recurring.cadence,
            'nextDate': recurring.nextDate,
            'paused': recurring.paused,
          },
    'reminder': reminder == null
        ? null
        : {
            'enabled': reminder.enabled,
            'hour': reminder.hour,
            'minute': reminder.minute,
            'weekdays': [...reminder.weekdays]..sort(),
            'snoozedUntil': reminder.snoozedUntil,
          },
    'openingBalance': jar.openingBalance ?? (jar.entries.isEmpty ? jar.balance : 0),
    'archived': jar.isArchived,
  };
}

bool _sameEntry(Entry a, Entry b) =>
    a.amount == b.amount &&
    a.direction == b.direction &&
    a.at == b.at &&
    a.note == b.note &&
    (a.source ?? sourceManual) == (b.source ?? sourceManual) &&
    a.undoOf == b.undoOf &&
    _revisionsEqual(a.revisions, b.revisions);

bool _revisionsEqual(List<EntryRevision>? a, List<EntryRevision>? b) {
  final left = a ?? const <EntryRevision>[];
  final right = b ?? const <EntryRevision>[];
  if (left.length != right.length) return false;
  for (var i = 0; i < left.length; i++) {
    if (left[i].amount != right[i].amount ||
        left[i].at != right[i].at ||
        left[i].note != right[i].note ||
        left[i].changedAt != right[i].changedAt) {
      return false;
    }
  }
  return true;
}

class MergeResult {
  const MergeResult({
    required this.jars,
    required this.added,
    required this.updated,
    required this.skipped,
    this.error,
  });

  final List<Jar> jars;
  final int added;
  final int updated;
  final int skipped;
  final String? error;
}

MergeResult _unchanged(List<Jar> current, [String? error]) => MergeResult(
      jars: current,
      added: 0,
      updated: 0,
      skipped: 0,
      error: error,
    );

MergeResult mergeTransferJars(
  List<Jar> current,
  List<Jar> incoming, [
  String? sourceCurrency,
  String? currentCurrency,
]) {
  if (sourceCurrency != null &&
      currentCurrency != null &&
      sourceCurrency != currentCurrency) {
    return _unchanged(
      current,
      'Change your currency to match this transfer before importing.',
    );
  }
  if (incoming.map((jar) => jar.id).toSet().length != incoming.length) {
    return _unchanged(current, 'This transfer contains duplicate jars.');
  }
  if (incoming.any((jar) => !validTransactionHistory(jar.copyWith(
        openingBalance: jar.openingBalance ?? (jar.entries.isEmpty ? jar.balance : 0),
      )))) {
    return _unchanged(
      current,
      'This transfer contains a balance that does not match its history.',
    );
  }

  final localById = {for (final jar in current) jar.id: jar};
  final next = [...current];
  var added = 0;
  var updated = 0;
  var skipped = 0;

  for (final jar in incoming) {
    final local = localById[jar.id];
    if (local == null) {
      next.add(jar);
      added += 1;
      continue;
    }
    if (_jarSettings(local).toString() != _jarSettings(jar).toString()) {
      return _unchanged(
        current,
        'Jar “${jar.name}” has conflicting settings. Resolve the copies before importing.',
      );
    }

    bool isSuffix(List<Entry> short, List<Entry> long) {
      if (long.length < short.length) return false;
      final offset = long.length - short.length;
      for (var i = 0; i < short.length; i++) {
        if (!_sameEntry(short[i], long[offset + i])) return false;
      }
      return true;
    }

    final localSuffix = isSuffix(local.entries, jar.entries);
    final incomingSuffix = isSuffix(jar.entries, local.entries);
    if (!localSuffix && !incomingSuffix) {
      return _unchanged(
        current,
        'Jar “${jar.name}” has different contribution histories. No jars were imported.',
      );
    }

    if (jar.entries.length > local.entries.length && localSuffix) {
      final index = next.indexWhere((item) => item.id == jar.id);
      next[index] = jar.copyWith(createdAt: local.createdAt);
      updated += 1;
    } else if (jar.entries.length < local.entries.length && incomingSuffix) {
      skipped += 1;
    } else if (jar.balance == local.balance) {
      skipped += 1;
    } else {
      return _unchanged(
        current,
        'Jar “${jar.name}” has a balance that does not match its history.',
      );
    }
  }

  final activeTotal = next
      .where((jar) => !jar.isArchived)
      .fold<int>(0, (total, jar) => total + jar.balance);
  if (!isSafeInteger(activeTotal)) {
    return _unchanged(current, 'This transfer exceeds the safe savings total.');
  }
  return MergeResult(jars: next, added: added, updated: updated, skipped: skipped);
}
