/// Savings store: the single source of truth for jars on this device.
///
/// Port of `lib/savings-store.tsx` onto Riverpod. Mutations always compute
/// against the latest committed state, reject unavailable storage, and publish
/// success only after persistence through a single mutation queue.
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
  Future<void> _mutationQueue = Future.value();

  List<Jar> get _jars => state.value?.jars ?? const [];

  void _requireWritable() {
    final current = state.value;
    if (state.isLoading ||
        state.hasError ||
        current == null ||
        !current.ready ||
        !current.writable ||
        _storage == null) {
      throw StoreException(
        'storage-unavailable',
        'Savings storage is not available. Try again after it has loaded.',
      );
    }
  }

  Future<T> _mutate<T>(Future<T> Function() action) async {
    _requireWritable();
    final operation = _mutationQueue.then((_) {
      _requireWritable();
      return action();
    });
    _mutationQueue = operation.then<void>((_) {}, onError: (Object _) {});
    return operation;
  }

  Future<void> _persist(KeyValueStorage storage, List<Jar> next) async {
    try {
      await _persister.persist(storage, next);
    } catch (_) {
      throw StoreException(
        'save-failed',
        'Your latest changes could not be saved. Please try again.',
      );
    }
  }

  Future<void> _commit(List<Jar> next) async {
    try {
      await _persist(_storage!, next);
    } on StoreException catch (error) {
      if (ref.mounted) {
        state = AsyncData(state.value!.copyWith(storageError: error.message));
      }
      rethrow;
    }
    if (ref.mounted) {
      state = AsyncData(
        state.value!.copyWith(jars: next, clearStorageError: true),
      );
    }
  }

  Future<bool> _saveJar(Jar updated) async {
    final next = [
      for (final item in _jars)
        if (item.id == updated.id) updated else item,
    ];
    if (safeActiveSavingsTotal(next) == null || !validLedgerJar(updated)) {
      return false;
    }
    await _commit(next);
    return true;
  }

  @override
  Future<SavingsState> build() async {
    final storage = await ref.watch(storageProvider.future);
    _storage = storage;
    try {
      final loaded = await loadPersistedJars(storage);
      if (!loaded.writable) {
        return SavingsState(
          jars: loaded.jars,
          ready: true,
          writable: false,
          storageError:
              'Saved data could not be read. Changes will not be saved.',
        );
      }
      final initial = SavingsState(
        jars: loaded.jars,
        ready: true,
        writable: true,
      );
      final caughtUp = runDueRecurringSafely(initial.jars, DateTime.now());
      if (identical(caughtUp, initial.jars)) return initial;
      try {
        await _persist(storage, caughtUp);
        return initial.copyWith(jars: caughtUp);
      } on StoreException catch (error) {
        return initial.copyWith(storageError: error.message);
      }
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

  /// Commits due entries and their cursor together when returning to the app.
  Future<void> catchUpRecurring([DateTime? now]) => _mutate(() async {
    final current = _jars;
    final next = runDueRecurringSafely(current, now ?? DateTime.now());
    if (!identical(current, next)) await _commit(next);
  });

  Future<String> addJar(JarInput input) => _mutate(() async {
    if (!isValidOptionalDeadline(input.deadline)) {
      throw StoreException('invalid-deadline', deadlineInputHelp);
    }
    final deadline = input.deadline?.trim();
    if ((input.reminder != null && !isValidJarReminder(input.reminder)) ||
        input.name.trim().isEmpty ||
        !isSafeInteger(input.target) ||
        input.target <= 0 ||
        (input.recurring != null &&
            (!isSafeInteger(input.recurring!.amount) ||
                input.recurring!.amount <= 0 ||
                !hasValidRecurringSchedule(input.recurring!)))) {
      throw StoreException('invalid-amount', 'Enter a valid target amount.');
    }
    final id =
        'jar-${DateTime.now().millisecondsSinceEpoch}-${_randomIdSuffix()}';
    await _commit([
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
        deadline: deadline == '' ? null : deadline,
        streak: input.streak,
        milestonesHit: [],
        recurring: input.recurring,
        reminder: input.reminder,
        entries: [],
      ),
    ]);
    return id;
  });

  Future<void> editJar(String id, JarEdit input) => _mutate(() async {
    if (!input.clearDeadline && !isValidOptionalDeadline(input.deadline)) {
      throw StoreException('invalid-deadline', deadlineInputHelp);
    }
    final deadline = input.deadline?.trim();
    if ((input.reminder != null && !isValidJarReminder(input.reminder)) ||
        (input.target != null &&
            (!isSafeInteger(input.target!) || input.target! <= 0)) ||
        (input.recurring != null &&
            (!isSafeInteger(input.recurring!.amount) ||
                input.recurring!.amount <= 0 ||
                !hasValidRecurringSchedule(input.recurring!)))) {
      throw StoreException('invalid-amount', 'Enter valid jar amounts.');
    }
    await _commit([
      for (final jar in _jars)
        if (jar.id == id)
          jar.copyWith(
            name: input.name,
            target: input.target,
            accent: input.accent,
            icon: input.icon,
            kind: input.kind,
            deadline: deadline,
            clearDeadline: input.clearDeadline || deadline == '',
            streak: input.streak,
            recurring: input.recurring,
            clearRecurring: false,
            reminder: input.reminder,
            clearReminder: input.clearReminder,
          )
        else
          jar,
    ]);
  });

  Future<void> archiveJar(String id) => _mutate(
    () => _commit([
      for (final jar in _jars)
        if (jar.id == id) jar.copyWith(archived: true) else jar,
    ]),
  );

  /// Bring an archived jar back into the active list.
  Future<void> restoreJar(String id) => _mutate(() async {
    final jar = _jars
        .where((candidate) => candidate.id == id && candidate.isArchived)
        .firstOrNull;
    if (jar == null) return;
    final total = safeActiveSavingsTotal(_jars);
    if (total == null || jar.balance > maxSafeInteger - total) {
      throw StoreException(
        'unsafe-total',
        'Restoring this jar would exceed the supported savings total.',
      );
    }
    final rule = jar.recurring;
    final nextRule =
        rule != null && !rule.paused && cadences.contains(rule.cadence)
        ? rule.copyWith(
            nextDate: toIso(addCadence(DateTime.now(), rule.cadence)),
          )
        : rule;
    await _commit([
      for (final candidate in _jars)
        if (candidate.id == id)
          jar.copyWith(archived: false, recurring: nextRule)
        else
          candidate,
    ]);
  });

  /// Permanently remove an archived jar and its history.
  Future<void> deleteJarPermanently(String id) => _mutate(
    () => _commit([
      for (final jar in _jars)
        if (jar.id != id) jar,
    ]),
  );

  Future<bool> correctEntry(String id, String entryId, EntryCorrection input) =>
      _mutate(() async {
        final jar = _jars.where((item) => item.id == id).firstOrNull;
        final updated = jar == null
            ? null
            : tx.correctEntry(jar, entryId, input);
        return updated != null && await _saveJar(updated);
      });

  Future<bool> undoEntry(String id, String entryId) => _mutate(() async {
    final jar = _jars.where((item) => item.id == id).firstOrNull;
    final updated = jar == null ? null : tx.undoEntry(jar, entryId);
    return updated != null && await _saveJar(updated);
  });

  /// Apply a deposit or withdrawal. Returns the created entry ID and the
  /// highest milestone reached, or null when rejected.
  Future<AddEntryResult?> addEntry(
    String id,
    int amountMinor,
    String direction, {
    String? note,
    String source = sourceManual,
  }) => _mutate(() async {
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
    if (applied == null || !await _saveJar(applied.jar)) return null;
    return AddEntryResult(
      id: applied.jar.entries[0].id,
      reached: applied.reached.isNotEmpty
          ? applied.reached.reduce((a, b) => a > b ? a : b)
          : null,
    );
  });

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
  Future<ImportResult> importTransfer(
    List<String> frames,
    String? currentCurrency,
  ) => _mutate(() async {
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
    if (merged.added > 0 || merged.updated > 0) await _commit(merged.jars);
    return ImportResult(
      added: merged.added,
      updated: merged.updated,
      skipped: merged.skipped,
    );
  });
}

String _randomIdSuffix() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  final random = Random();
  return String.fromCharCodes(
    List.generate(6, (_) => chars.codeUnitAt(random.nextInt(chars.length))),
  );
}
