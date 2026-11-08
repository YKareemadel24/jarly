/// Jar types and the core state machine of the Saving Jar domain.
///
/// Rules enforced here:
/// - Milestone levels are 25/50/75/100 and every crossed level is recorded.
/// - Habit streaks are calendar-day based, not deposit-count based.
/// - Jars are immutable values: every operation returns a new jar object.
///
/// Field names and JSON shapes mirror the original TypeScript app exactly so
/// both apps can read the same persisted and transferred data.
library;

import 'dart:math';

import 'money.dart';
import 'time.dart';

export 'money.dart' show maxSafeInteger, mathRound, isSafeInteger;

const String directionDeposit = 'deposit';
const String directionWithdrawal = 'withdrawal';
const String sourceManual = 'manual';
const String sourceRecurring = 'recurring';
const String kindGoal = 'goal';
const String kindHabit = 'habit';

/// Field-wise list equality without pulling in package:collection.
bool listEquals<T>(List<T>? a, List<T>? b) {
  if (a == null || b == null) return identical(a, b);
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// Valid accent names, in the order the picker offers them.
const List<String> accents = ['coral', 'amber', 'mint', 'ocean', 'berry', 'clay'];

/// Valid recurring cadences.
const List<String> cadences = ['daily', 'weekly', 'biweekly', 'monthly'];

const List<int> milestoneLevels = [25, 50, 75, 100];

/// One recorded correction of an entry. The original values are kept here and
/// the entry itself carries the corrected ones.
class EntryRevision {
  const EntryRevision({
    required this.amount,
    required this.at,
    this.note,
    required this.changedAt,
  });

  final int amount;
  final String at;
  final String? note;
  final String changedAt;

  EntryRevision copyWith({int? amount, String? at, String? note, String? changedAt}) =>
      EntryRevision(
        amount: amount ?? this.amount,
        at: at ?? this.at,
        note: note ?? this.note,
        changedAt: changedAt ?? this.changedAt,
      );


  @override
  bool operator ==(Object other) =>
      other is EntryRevision &&
      other.amount == amount &&
      other.at == at &&
      other.note == note &&
      other.changedAt == changedAt;

  @override
  int get hashCode => Object.hash(amount, at, note, changedAt);

  Map<String, dynamic> toJson() => {
    'amount': amount,
    'at': at,
    if (note != null) 'note': note,
    'changedAt': changedAt,
  };

  static EntryRevision fromJson(Map<String, dynamic> json) => EntryRevision(
    amount: (json['amount'] as num?)?.toInt() ?? 0,
    at: json['at'] as String? ?? '',
    note: json['note'] as String?,
    changedAt: json['changedAt'] as String? ?? '',
  );
}

/// Per-jar personal reminder: local clock time and Sunday=0 weekdays.
class JarReminder {
  const JarReminder({
    required this.enabled,
    required this.hour,
    required this.minute,
    required this.weekdays,
    this.snoozedUntil,
  });

  final bool enabled;
  final int hour;
  final int minute;
  final List<int> weekdays;
  final String? snoozedUntil;

  JarReminder copyWith({bool? enabled, int? hour, int? minute, List<int>? weekdays, String? snoozedUntil}) =>
      JarReminder(
        enabled: enabled ?? this.enabled,
        hour: hour ?? this.hour,
        minute: minute ?? this.minute,
        weekdays: weekdays ?? this.weekdays,
        snoozedUntil: snoozedUntil ?? this.snoozedUntil,
      );


  @override
  bool operator ==(Object other) =>
      other is JarReminder &&
      other.enabled == enabled &&
      other.hour == hour &&
      other.minute == minute &&
      listEquals(other.weekdays, weekdays) &&
      other.snoozedUntil == snoozedUntil;

  @override
  int get hashCode => Object.hash(enabled, hour, minute, Object.hashAll(weekdays), snoozedUntil);

  Map<String, dynamic> toJson() => {
    'enabled': enabled,
    'hour': hour,
    'minute': minute,
    'weekdays': weekdays,
    if (snoozedUntil != null) 'snoozedUntil': snoozedUntil,
  };

  static JarReminder fromJson(Map<String, dynamic> json) => JarReminder(
    enabled: json['enabled'] == true,
    hour: (json['hour'] as num?)?.toInt() ?? 0,
    minute: (json['minute'] as num?)?.toInt() ?? 0,
    weekdays: ((json['weekdays'] as List?) ?? const [])
        .map((day) => (day as num).toInt())
        .toList(),
    snoozedUntil: json['snoozedUntil'] as String?,
  );
}

/// A single ledger movement. [amount] is always a positive integer in minor
/// units; [direction] carries the sign.
class Entry {
  const Entry({
    required this.id,
    required this.amount,
    required this.direction,
    this.note,
    required this.at,
    this.source,
    this.revisions,
    this.undoOf,
  });

  final String id;
  final int amount;
  final String direction;
  final String? note;
  final String at;
  final String? source;
  final List<EntryRevision>? revisions;

  /// The entry reversed by this compensating transaction.
  final String? undoOf;

  Entry copyWith({
    String? id,
    int? amount,
    String? direction,
    String? note,
    String? at,
    String? source,
    List<EntryRevision>? revisions,
    String? undoOf,
  }) =>
      Entry(
        id: id ?? this.id,
        amount: amount ?? this.amount,
        direction: direction ?? this.direction,
        note: note ?? this.note,
        at: at ?? this.at,
        source: source ?? this.source,
        revisions: revisions ?? this.revisions,
        undoOf: undoOf ?? this.undoOf,
      );


  @override
  bool operator ==(Object other) =>
      other is Entry &&
      other.id == id &&
      other.amount == amount &&
      other.direction == direction &&
      other.note == note &&
      other.at == at &&
      other.source == source &&
      listEquals(other.revisions, revisions) &&
      other.undoOf == undoOf;

  @override
  int get hashCode => Object.hash(
      id, amount, direction, note, at, source, undoOf);

  Map<String, dynamic> toJson() => {
    'id': id,
    'amount': amount,
    'direction': direction,
    if (note != null) 'note': note,
    'at': at,
    if (source != null) 'source': source,
    if (revisions != null) 'revisions': revisions!.map((r) => r.toJson()).toList(),
    if (undoOf != null) 'undoOf': undoOf,
  };

  static Entry fromJson(Map<String, dynamic> json) => Entry(
    id: json['id'] as String? ?? '',
    amount: (json['amount'] as num?)?.toInt() ?? 0,
    direction: json['direction'] as String? ?? directionDeposit,
    note: json['note'] as String?,
    at: json['at'] as String? ?? '',
    source: json['source'] as String?,
    revisions: (json['revisions'] as List?)
        ?.map((value) => EntryRevision.fromJson((value as Map).cast<String, dynamic>()))
        .toList(),
    undoOf: json['undoOf'] as String?,
  );
}

/// A recurring-deposit schedule attached to a jar.
class RecurringRule {
  const RecurringRule({
    required this.amount,
    required this.cadence,
    required this.paused,
    this.nextDate,
  });

  final int amount;
  final String cadence;
  final bool paused;
  final String? nextDate;

  RecurringRule copyWith({int? amount, String? cadence, bool? paused, String? nextDate}) =>
      RecurringRule(
        amount: amount ?? this.amount,
        cadence: cadence ?? this.cadence,
        paused: paused ?? this.paused,
        nextDate: nextDate ?? this.nextDate,
      );

  @override
  bool operator ==(Object other) =>
      other is RecurringRule &&
      other.amount == amount &&
      other.cadence == cadence &&
      other.paused == paused &&
      other.nextDate == nextDate;

  @override
  int get hashCode => Object.hash(amount, cadence, paused, nextDate);

  Map<String, dynamic> toJson() => {
    'amount': amount,
    'cadence': cadence,
    'paused': paused,
    if (nextDate != null) 'nextDate': nextDate,
  };

  static RecurringRule fromJson(Map<String, dynamic> json) => RecurringRule(
    amount: (json['amount'] as num?)?.toInt() ?? 0,
    cadence: json['cadence'] as String? ?? 'weekly',
    paused: json['paused'] == true,
    nextDate: json['nextDate'] as String?,
  );
}

/// A savings jar: the aggregate root of the whole domain.
class Jar {
  const Jar({
    required this.id,
    required this.name,
    required this.target,
    required this.balance,
    this.openingBalance,
    required this.accent,
    required this.icon,
    required this.kind,
    required this.createdAt,
    this.deadline,
    this.streak,
    this.lastDepositAt,
    required this.milestonesHit,
    this.archived,
    this.recurring,
    this.reminder,
    required this.entries,
  });

  final String id;
  final String name;
  final int target;
  final int balance;

  /// Legacy savings recorded before a transaction ledger existed.
  final int? openingBalance;
  final String accent;
  final String icon;
  final String kind;
  final String createdAt;
  final String? deadline;
  final int? streak;
  final String? lastDepositAt;
  final List<int> milestonesHit;
  final bool? archived;
  final RecurringRule? recurring;
  final JarReminder? reminder;
  final List<Entry> entries;

  bool get isArchived => archived == true;

  Jar copyWith({
    String? id,
    String? name,
    int? target,
    int? balance,
    int? openingBalance,
    bool clearOpeningBalance = false,
    String? accent,
    String? icon,
    String? kind,
    String? createdAt,
    String? deadline,
    bool clearDeadline = false,
    int? streak,
    String? lastDepositAt,
    List<int>? milestonesHit,
    bool? archived,
    RecurringRule? recurring,
    bool clearRecurring = false,
    JarReminder? reminder,
    bool clearReminder = false,
    List<Entry>? entries,
  }) =>
      Jar(
        id: id ?? this.id,
        name: name ?? this.name,
        target: target ?? this.target,
        balance: balance ?? this.balance,
        openingBalance: clearOpeningBalance ? null : (openingBalance ?? this.openingBalance),
        accent: accent ?? this.accent,
        icon: icon ?? this.icon,
        kind: kind ?? this.kind,
        createdAt: createdAt ?? this.createdAt,
        deadline: clearDeadline ? null : (deadline ?? this.deadline),
        streak: streak ?? this.streak,
        lastDepositAt: lastDepositAt ?? this.lastDepositAt,
        milestonesHit: milestonesHit ?? this.milestonesHit,
        archived: archived ?? this.archived,
        recurring: clearRecurring ? null : (recurring ?? this.recurring),
        reminder: clearReminder ? null : (reminder ?? this.reminder),
        entries: entries ?? this.entries,
      );

  @override
  bool operator ==(Object other) =>
      other is Jar &&
      other.id == id &&
      other.name == name &&
      other.target == target &&
      other.balance == balance &&
      other.openingBalance == openingBalance &&
      other.accent == accent &&
      other.icon == icon &&
      other.kind == kind &&
      other.createdAt == createdAt &&
      other.deadline == deadline &&
      other.streak == streak &&
      other.lastDepositAt == lastDepositAt &&
      listEquals(other.milestonesHit, milestonesHit) &&
      other.archived == archived &&
      other.recurring == recurring &&
      other.reminder == reminder &&
      listEquals(other.entries, entries);

  @override
  int get hashCode => id.hashCode;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'target': target,
    'balance': balance,
    if (openingBalance != null) 'openingBalance': openingBalance,
    'accent': accent,
    'icon': icon,
    'kind': kind,
    'createdAt': createdAt,
    if (deadline != null) 'deadline': deadline,
    if (streak != null) 'streak': streak,
    if (lastDepositAt != null) 'lastDepositAt': lastDepositAt,
    'milestonesHit': milestonesHit,
    if (archived != null) 'archived': archived,
    if (recurring != null) 'recurring': recurring!.toJson(),
    if (reminder != null) 'reminder': reminder!.toJson(),
    'entries': entries.map((entry) => entry.toJson()).toList(),
  };

  static Jar fromJson(Map<String, dynamic> json) => Jar(
    id: json['id'] as String? ?? '',
    name: json['name'] as String? ?? '',
    target: (json['target'] as num?)?.toInt() ?? 0,
    balance: (json['balance'] as num?)?.toInt() ?? 0,
    openingBalance: (json['openingBalance'] as num?)?.toInt(),
    accent: json['accent'] as String? ?? 'ocean',
    icon: json['icon'] as String? ?? '🫙',
    kind: json['kind'] as String? ?? kindGoal,
    createdAt: json['createdAt'] as String? ?? toIso(DateTime.now()),
    deadline: json['deadline'] as String?,
    streak: (json['streak'] as num?)?.toInt(),
    lastDepositAt: json['lastDepositAt'] as String?,
    milestonesHit: ((json['milestonesHit'] as List?) ?? const [])
        .map((value) => (value as num).toInt())
        .toList(),
    archived: json['archived'] as bool?,
    recurring: json['recurring'] is Map
        ? RecurringRule.fromJson((json['recurring'] as Map).cast<String, dynamic>())
        : null,
    reminder: json['reminder'] is Map
        ? JarReminder.fromJson((json['reminder'] as Map).cast<String, dynamic>())
        : null,
    entries: ((json['entries'] as List?) ?? const [])
        .whereType<Map>()
        .map((value) => Entry.fromJson(value.cast<String, dynamic>()))
        .toList(),
  );
}

/// Real contributions, excluding both sides of an Undo while retaining the full ledger.
List<Entry> effectiveEntries(List<Entry> entries) {
  final reversed = <String>{
    for (final entry in entries)
      if (entry.undoOf != null) entry.undoOf!,
  };
  return entries.where((entry) => entry.undoOf == null && !reversed.contains(entry.id)).toList();
}

/// Progress toward the target, 0–100 clamped. Zero when there is no target.
int percent(Jar jar) {
  if (jar.target <= 0) return 0;
  return mathRound((jar.balance / jar.target) * 100).clamp(0, 100);
}

/// Active jars only for every insight: archived jars live on as history, not
/// momentum. Centralises the filter so callers cannot forget it.
List<T> activeJars<T>(Iterable<T> jars, bool Function(T) isArchived) =>
    jars.where((jar) => !isArchived(jar)).toList();

/// All milestone levels newly crossed when balance moves to [nextBalance].
List<int> crossedMilestones(Jar jar, int nextBalance) {
  if (jar.target <= 0) return [];
  return milestoneLevels
      .where((level) =>
          !jar.milestonesHit.contains(level) &&
          (nextBalance / jar.target) * 100 >= level)
      .toList();
}

String _randomIdSuffix() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  final random = Random();
  return String.fromCharCodes(
    List.generate(6, (_) => chars.codeUnitAt(random.nextInt(chars.length))),
  );
}

/// Local-day keys with at least one deposit — backing for the habit rhythm view.
Set<String> depositDayKeys(List<Entry> entries) {
  return {
    for (final entry in entries)
      if (entry.direction == directionDeposit) dayKey(parseIso(entry.at)),
  };
}

/// Result of applying a single entry to a jar.
class AppliedEntry {
  const AppliedEntry({required this.jar, required this.reached});
  final Jar jar;
  final List<int> reached;
}

/// Apply a deposit or withdrawal. Returns null when the operation is invalid
/// (bad jar state, non-positive amount, withdrawal above balance).
AppliedEntry? applyEntry(
  Jar jar,
  int amountMinor,
  String direction, {
  String? note,
  String source = sourceManual,
  DateTime? now,
}) {
  final nowDate = now ?? DateTime.now();
  if (!isSafeInteger(amountMinor) || amountMinor <= 0) return null;
  if (!isSafeInteger(jar.balance) || jar.balance < 0) return null;
  if (direction == directionWithdrawal && amountMinor > jar.balance) return null;

  final nextBalance =
      jar.balance + (direction == directionDeposit ? amountMinor : -amountMinor);
  if (!isSafeInteger(nextBalance) || nextBalance < 0) return null;
  final reached =
      direction == directionDeposit ? crossedMilestones(jar, nextBalance) : <int>[];

  int? streak = jar.streak;
  String? lastDepositAt = jar.lastDepositAt;
  if (direction == directionDeposit && jar.kind == kindHabit) {
    final today = dayKey(nowDate);
    final yesterday = previousDayKey(today);
    final last = lastDepositAt != null ? dayKey(parseIso(lastDepositAt)) : null;
    if (last != today) {
      streak = last == yesterday ? (streak ?? 0) + 1 : 1;
    }
    lastDepositAt = toIso(nowDate);
  }

  final entry = Entry(
    id: 'entry-${nowDate.millisecondsSinceEpoch}-${_randomIdSuffix()}',
    amount: amountMinor,
    direction: direction,
    note: note,
    at: toIso(nowDate),
    source: source,
  );

  return AppliedEntry(
    jar: jar.copyWith(
      balance: nextBalance,
      milestonesHit: reached.isNotEmpty
          ? [...jar.milestonesHit, ...reached]
          : jar.milestonesHit,
      streak: streak,
      lastDepositAt: lastDepositAt,
      entries: [entry, ...jar.entries],
    ),
    reached: reached,
  );
}

/// Light-theme accent hex values, keyed by accent name.
const Map<String, String> jarAccent = {
  'coral': '#D97963',
  'amber': '#D9A93E',
  'mint': '#63AD91',
  'ocean': '#6D9CB2',
  'berry': '#A96B97',
  'clay': '#AF7D5C',
};

/// Brighter dark-theme variants so alpha-tinted accents stay legible on
/// #2D2722 surfaces.
const Map<String, String> jarAccentDark = {
  'coral': '#E8917C',
  'amber': '#E8BE5F',
  'mint': '#7FC4A8',
  'ocean': '#85B4C9',
  'berry': '#C08BB2',
  'clay': '#C79A78',
};

const Map<String, String> _accentAliases = {
  'blue': 'ocean',
  'coral': 'coral',
  'amber': 'amber',
  'mint': 'mint',
  'ocean': 'ocean',
  'berry': 'berry',
  'clay': 'clay',
};

int? _scaleNum(Object? value, bool scaleToMinor, [int fallback = 0]) {
  final num? parsed = switch (value) {
    int() => value,
    double() => value,
    String() => num.tryParse(value),
    _ => null,
  };
  final num resolved = parsed ?? fallback;
  if (scaleToMinor) {
    return mathRound(resolved * 100);
  }
  // JSON numbers may arrive as whole-value doubles; collapse them to ints the
  // way JS treated every number as one type.
  final asDouble = resolved.toDouble();
  if (resolved is double && asDouble == asDouble.roundToDouble()) {
    return asDouble.toInt();
  }
  return resolved is int ? resolved : asDouble.toInt();
}

/// Normalise a persisted (possibly legacy) jar map into the current shape.
/// When [scaleToMinor] is set, numeric money fields are converted from legacy
/// whole-currency floats.
Jar normaliseJar(Map<String, dynamic> raw, {bool scaleToMinor = false}) {
  Map<String, dynamic>? recurringRaw;
  if (raw['recurring'] is Map) recurringRaw = (raw['recurring'] as Map).cast<String, dynamic>();
  RecurringRule? recurring = recurringRaw == null
      ? null
      : RecurringRule(
          amount: _scaleNum(recurringRaw['amount'], scaleToMinor) ?? 0,
          cadence: recurringRaw['cadence'] as String? ?? 'weekly',
          paused: recurringRaw['paused'] == true,
          nextDate: recurringRaw['nextDate'] as String?,
        );

  final entryList = ((raw['entries'] as List?) ?? const [])
      .whereType<Map>()
      .map((value) {
        final entry = value.cast<String, dynamic>();
        return Entry.fromJson(entry)
            .copyWith(amount: _scaleNum(entry['amount'], scaleToMinor) ?? 0);
      })
      .toList();

  final balance = _scaleNum(raw['balance'], scaleToMinor) ?? 0;
  int? openingBalance =
      raw['openingBalance'] == null ? null : _scaleNum(raw['openingBalance'], scaleToMinor);
  if (openingBalance == null &&
      isSafeInteger(balance) &&
      entryList.every((entry) => isSafeInteger(entry.amount))) {
    var opening = BigInt.from(balance);
    for (final entry in entryList) {
      final signed = BigInt.from(entry.amount) * (entry.direction == directionDeposit ? BigInt.one : BigInt.from(-1));
      opening -= signed;
    }
    if (opening >= BigInt.zero && opening <= BigInt.from(maxSafeInteger)) {
      openingBalance = opening.toInt();
    }
  }

  return Jar(
    id: raw['id'] as String? ?? '',
    name: raw['name'] as String? ?? '',
    target: _scaleNum(raw['target'], scaleToMinor) ?? 0,
    balance: balance,
    openingBalance: openingBalance,
    accent: _accentAliases[raw['accent'] as String?] ?? 'ocean',
    icon: raw['icon'] as String? ?? '🫙',
    kind: (raw['kind'] as String?) ?? (recurring != null ? kindHabit : kindGoal),
    createdAt: (raw['createdAt'] as String?) ?? toIso(DateTime.now()),
    deadline: raw['deadline'] as String?,
    streak: (raw['streak'] as num?)?.toInt(),
    lastDepositAt: raw['lastDepositAt'] as String?,
    milestonesHit: ((raw['milestonesHit'] as List?) ?? const [])
        .map((value) => (value as num).toInt())
        .toList(),
    archived: raw['archived'] as bool?,
    recurring: recurring,
    reminder: raw['reminder'] is Map
        ? JarReminder.fromJson((raw['reminder'] as Map).cast<String, dynamic>())
        : null,
    entries: entryList,
  );
}
