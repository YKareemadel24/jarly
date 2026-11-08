/// Savings store: the single source of truth for jars on this device.
///
/// Port of `lib/savings-store.tsx` onto Riverpod. Mutations always compute
/// against the freshest state (double-tap safe), reject when a change would
/// push the active total beyond the JSON-safe range, and persist write-behind
/// through the single-flight queue.
library;

import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/key_value_storage.dart';
import '../data/savings_storage.dart';
import '../domain/domain.dart';
import '../domain/transactions.dart' as tx;
import '../transfer/merge.dart';
import '../transfer/transfer.dart';
import 'providers.dart';

class StoreException implements Exception {
  StoreException(this.code, this.message);

  /// "invalid-amount" | "provider-missing" | "jar-missing"
  final String code;
  final String message;

  @override
  String toString() => message;
}

/// Everything a new-jar creation needs.
class JarInput {
  const JarInput({
    required this.name,
    required this.target,
    required this.accent,
    required this.icon,
    required this.kind,
    this.deadline,
    this.streak,
    this.recurring,
    this.reminder,
  });

  final String name;
  final int target;
  final String accent;
  final String icon;
  final String kind;
  final String? deadline;
  final int? streak;
  final RecurringRule? recurring;
  final JarReminder? reminder;
}

/// Partial jar edit; null fields are left unchanged, mirroring the spread of a
/// partial object in the original store.
class JarEdit {
  const JarEdit({
    this.name,
    this.target,
    this.accent,
    this.icon,
    this.kind,
    this.deadline,
    this.clearDeadline = false,
    this.streak,
    this.recurring,
    this.reminder,
    this.clearReminder = false,
  });

  final String? name;
  final int? target;
  final String? accent;
  final String? icon;
  final String? kind;
  final String? deadline;
  final bool clearDeadline;
  final int? streak;
  final RecurringRule? recurring;
  final JarReminder? reminder;
  final bool clearReminder;
}

class AddEntryResult {
  const AddEntryResult({required this.id, this.reached});
  final String id;
  final int? reached;
}

class ImportResult {
  const ImportResult({
    required this.added,
    required this.updated,
    required this.skipped,
    this.error,
  });
  final int added;
  final int updated;
  final int skipped;
  final String? error;
}

class SavingsState {
  const SavingsState({
    required this.jars,
    required this.ready,
    required this.writable,
    this.storageError,
  });

  static const initial = SavingsState(jars: [], ready: false, writable: false);

  /// All jars on this device.
  final List<Jar> jars;
  final bool ready;
  final bool writable;
  final String? storageError;

  int get total => jars
      .where((jar) => !jar.isArchived)
      .fold<int>(0, (sum, jar) => sum + jar.balance);

  SavingsState copyWith({
    List<Jar>? jars,
    bool? ready,
    bool? writable,
    String? storageError,
    bool clearStorageError = false,
  }) => SavingsState(
    jars: jars ?? this.jars,
    ready: ready ?? this.ready,
    writable: writable ?? this.writable,
    storageError: clearStorageError
        ? null
        : (storageError ?? this.storageError),
  );
}

class SavingsController extends AsyncNotifier<SavingsState> {
  KeyValueStorage? _storage;
  final JarsPersister _persister = JarsPersister();

  List<Jar> get _jars => state.value?.jars ?? const [];

  void _commit(List<Jar> next) {
    final current = state.value ?? SavingsState.initial;
    state = AsyncData(current.copyWith(jars: next));
    _schedulePersist(next);
  }

  void _schedulePersist(List<Jar> jars) {
    final current = state.value;
    final storage = _storage;
    if (current == null ||
        !current.ready ||
        !current.writable ||
        storage == null) {
      return;
    }
    _persister
        .persist(storage, jars)
        .then(
          (_) {
            final latest = state.value;
            if (latest != null) {
              state = AsyncData(latest.copyWith(clearStorageError: true));
            }
          },
          onError: (Object error) {
            final latest = state.value;
            if (latest != null) {
              state = AsyncData(
                latest.copyWith(
                  storageError: 'Your latest changes could not be saved.',
                ),
              );
            }
          },
        );
  }

  bool _saveJar(Jar updated) {
    final next = [
      for (final item in _jars)
        if (item.id == updated.id) updated else item,
    ];
    final total = next
        .where((item) => !item.isArchived)
        .fold<int>(0, (sum, item) => sum + item.balance);
    if (!isSafeInteger(total)) return false;
    _commit(next);
    return true;
  }

  @override
  Future<SavingsState> build() async {
    final storage = await ref.watch(storageProvider.future);
    _storage = storage;
    try {
      final loaded = await loadPersistedJars(storage);
      // Catch up due scheduled deposits before first paint of data.
      final caughtUp = runDueRecurringSafely(loaded.jars, DateTime.now());
      if (!loaded.writable) {
        return SavingsState(
          jars: caughtUp,
          ready: true,
          writable: false,
          storageError:
              'Saved data could not be read. Changes will not be saved.',
        );
      }
      return SavingsState(jars: caughtUp, ready: true, writable: true);
    } catch (error) {
      return const SavingsState(
        jars: [],
        ready: true,
        writable: false,
        storageError:
            'Saved data could not be read. Changes will not be saved.',
      );
    }
  }

  String addJar(JarInput input) {
    if ((input.reminder != null && !isValidJarReminder(input.reminder)) ||
        input.name.trim().isEmpty ||
        !isSafeInteger(input.target) ||
        input.target <= 0 ||
        (input.recurring != null &&
            (!isSafeInteger(input.recurring!.amount) ||
                input.recurring!.amount <= 0))) {
      throw StoreException('invalid-amount', 'Enter a valid target amount.');
    }
    final id =
        'jar-${DateTime.now().millisecondsSinceEpoch}-${_randomIdSuffix()}';
    _commit([
      ..._jars,
      Jar(
        id: id,
        name: input.name,
        target: input.target,
        balance: 0,
        accent: input.accent,
        icon: input.icon,
        kind: input.kind,
        createdAt: toIso(DateTime.now()),
        deadline: input.deadline,
        streak: input.streak,
        milestonesHit: [],
        recurring: input.recurring,
        reminder: input.reminder,
        entries: [],
      ),
    ]);
    return id;
  }

  void editJar(String id, JarEdit input) {
    if ((input.reminder != null && !isValidJarReminder(input.reminder)) ||
        (input.target != null &&
            (!isSafeInteger(input.target!) || input.target! <= 0)) ||
        (input.recurring != null &&
            (!isSafeInteger(input.recurring!.amount) ||
                input.recurring!.amount <= 0))) {
      throw StoreException('invalid-amount', 'Enter valid jar amounts.');
    }
    _commit([
      for (final jar in _jars)
        if (jar.id == id)
          jar.copyWith(
            name: input.name,
            target: input.target,
            accent: input.accent,
            icon: input.icon,
            kind: input.kind,
            deadline: input.deadline,
            clearDeadline: input.clearDeadline,
            streak: input.streak,
            recurring: input.recurring,
            clearRecurring: false,
            reminder: input.reminder,
            clearReminder: input.clearReminder,
          )
        else
          jar,
    ]);
  }

  void archiveJar(String id) => _commit([
    for (final jar in _jars)
      if (jar.id == id) jar.copyWith(archived: true) else jar,
  ]);

  /// Bring an archived jar back into the active list.
  void restoreJar(String id) => _commit([
    for (final jar in _jars)
      if (jar.id == id) jar.copyWith(archived: false) else jar,
  ]);

  /// Permanently remove an archived jar and its history.
  void deleteJarPermanently(String id) => _commit([
    for (final jar in _jars)
      if (jar.id != id) jar,
  ]);

  bool correctEntry(String id, String entryId, EntryCorrection input) {
    final jar = _jars.where((item) => item.id == id).firstOrNull;
    final updated = jar == null ? null : tx.correctEntry(jar, entryId, input);
    return updated != null && _saveJar(updated);
  }

  bool undoEntry(String id, String entryId) {
    final jar = _jars.where((item) => item.id == id).firstOrNull;
    final updated = jar == null ? null : tx.undoEntry(jar, entryId);
    return updated != null && _saveJar(updated);
  }

  /// Apply a deposit or withdrawal. Returns the created entry ID and the
  /// highest milestone reached, or null when rejected.
  AddEntryResult? addEntry(
    String id,
    int amountMinor,
    String direction, {
    String? note,
    String source = sourceManual,
  }) {
    final jar = _jars.where((candidate) => candidate.id == id).firstOrNull;
    if (jar == null || !isSafeInteger(amountMinor) || amountMinor <= 0) {
      return null;
    }
    if (direction == directionWithdrawal && amountMinor > jar.balance) {
      return null;
    }
    final applied = applyEntry(
      jar,
      amountMinor,
      direction,
      note: note,
      source: source,
    );
    if (applied == null || !_saveJar(applied.jar)) return null;
    return AddEntryResult(
      id: applied.jar.entries[0].id,
      reached: applied.reached.isNotEmpty
          ? applied.reached.reduce((a, b) => a > b ? a : b)
          : null,
    );
  }

  /// Everything on this device, ready to be handed to another device as QR
  /// frames.
  List<String> exportTransfer(String? currency) {
    final snapshot = TransferSnapshot(
      version: transferVersion,
      exportedAt: toIso(DateTime.now()),
      currency: currency,
      jars: _jars,
    );
    return encodeTransferFrames(snapshot);
  }

  /// Fold a scanned transfer into this device. Returns the number of jars
  /// added or updated, so the receiving screen can report something true.
  ImportResult importTransfer(List<String> frames, String? currentCurrency) {
    final assembly = decodeTransferFrames(frames);
    if (assembly == null) {
      return const ImportResult(
        added: 0,
        updated: 0,
        skipped: 0,
        error: 'That does not look like a Saving Jar code.',
      );
    }
    if (assembly.error != null) {
      return ImportResult(
        added: 0,
        updated: 0,
        skipped: 0,
        error: assembly.error,
      );
    }
    if (assembly.snapshot == null) {
      final missing = assembly.missing.length;
      return ImportResult(
        added: 0,
        updated: 0,
        skipped: 0,
        error: 'Still missing $missing code${missing == 1 ? '' : 's'}.',
      );
    }

    final merged = mergeTransferJars(
      _jars,
      assembly.snapshot!.jars,
      assembly.snapshot!.currency,
      currentCurrency,
    );
    if (merged.error != null) {
      return ImportResult(
        added: 0,
        updated: 0,
        skipped: 0,
        error: merged.error,
      );
    }
    if (merged.added > 0 || merged.updated > 0) _commit(merged.jars);
    return ImportResult(
      added: merged.added,
      updated: merged.updated,
      skipped: merged.skipped,
    );
  }
}

String _randomIdSuffix() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  final random = Random();
  return String.fromCharCodes(
    List.generate(6, (_) => chars.codeUnitAt(random.nextInt(chars.length))),
  );
}
