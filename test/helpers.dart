/// Shared test fixtures mirroring the vitest suite's `jar()` helpers.
library;

import 'package:jarly/domain/domain.dart';

Jar jar({
  String? id,
  String? name,
  int? balance,
  int? target,
  String? accent,
  String? icon,
  String? kind,
  String? createdAt,
  String? deadline,
  int? streak,
  String? lastDepositAt,
  List<int>? milestonesHit,
  bool? archived,
  RecurringRule? recurring,
  JarReminder? reminder,
  List<Entry>? entries,
  int? openingBalance,
}) => Jar(
  id: id ?? 'trip',
  name: name ?? 'Japan trip',
  balance: balance ?? 0,
  target: target ?? 10000,
  accent: accent ?? 'ocean',
  icon: icon ?? 'flight',
  kind: kind ?? kindGoal,
  createdAt: createdAt ?? '2026-01-01T00:00:00.000Z',
  deadline: deadline,
  streak: streak,
  lastDepositAt: lastDepositAt,
  milestonesHit: milestonesHit ?? [],
  archived: archived,
  recurring: recurring,
  reminder: reminder,
  entries: entries ?? [],
  openingBalance: openingBalance,
);

Entry dep(int amount, String at, {String? id, String? note, String? undoOf}) =>
    Entry(
      id: id ?? 'e-$amount-$at',
      amount: amount,
      direction: directionDeposit,
      source: sourceManual,
      at: at,
      note: note,
      undoOf: undoOf,
    );

Entry wdr(int amount, String at, {String? id}) => Entry(
  id: id ?? 'w-$amount-$at',
  amount: amount,
  direction: directionWithdrawal,
  source: sourceManual,
  at: at,
);
