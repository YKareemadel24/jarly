/// Commits browser ledger records through completed strict IndexedDB transactions.
library;

import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

import '../data/key_value_storage.dart';
import 'ledger_storage.dart';

Future<KeyValueStorage> createPlatformLedgerStorage(
  KeyValueStorage preferences,
) async {
  final opened = Completer<web.IDBDatabase>();
  final request = web.window.indexedDB.open('saving-jar-ledger', 1);
  request.onupgradeneeded = ((web.Event _) {
    (request.result as web.IDBDatabase).createObjectStore('ledger');
  }).toJS;
  request.onsuccess = ((web.Event _) {
    final database = request.result as web.IDBDatabase;
    if (opened.isCompleted) {
      database.close();
      return;
    }
    database.onversionchange = ((web.Event _) => database.close()).toJS;
    opened.complete(database);
  }).toJS;
  request.onerror = ((web.Event _) {
    if (!opened.isCompleted) {
      opened.completeError(
        StateError(request.error?.message ?? 'Ledger database could not open.'),
      );
    }
  }).toJS;
  request.onblocked = ((web.Event _) {
    if (!opened.isCompleted) {
      opened.completeError(StateError('Ledger database upgrade is blocked.'));
    }
  }).toJS;
  final database = await opened.future;
  try {
    return await IndexedDbLedgerStorage(database, preferences).initialize();
  } catch (_) {
    database.close();
    rethrow;
  }
}

class IndexedDbLedgerStorage extends LedgerStorage {
  IndexedDbLedgerStorage(this.database, super.preferences);

  final web.IDBDatabase database;

  @override
  Future<String?> readSnapshot() async {
    final transaction = database.transaction('ledger'.toJS, 'readonly');
    final request = transaction.objectStore('ledger').get('snapshot'.toJS);
    await _completed(transaction);
    final value = request.result;
    if (value == null) return null;
    if (!value.isA<JSString>()) {
      throw const FormatException('Invalid ledger storage record.');
    }
    return (value as JSString).toDart;
  }

  @override
  Future<void> writeSnapshot(String value) async {
    final transaction = database.transaction(
      'ledger'.toJS,
      'readwrite',
      web.IDBTransactionOptions(durability: 'strict'),
    );
    if (transaction.durability != 'strict') {
      transaction.abort();
      throw UnsupportedError(
        'Strict ledger transaction durability is unavailable.',
      );
    }
    try {
      transaction.objectStore('ledger').put(value.toJS, 'snapshot'.toJS);
    } catch (_) {
      transaction.abort();
      rethrow;
    }
    // A successful put request can still be rolled back by its transaction.
    await _completed(transaction);
  }

  Future<void> _completed(web.IDBTransaction transaction) {
    final completed = Completer<void>();
    transaction.oncomplete = ((web.Event _) => completed.complete()).toJS;
    void fail(web.Event _) {
      if (!completed.isCompleted) {
        completed.completeError(
          StateError(
            transaction.error?.message ?? 'Ledger transaction aborted.',
          ),
        );
      }
    }

    transaction.onerror = fail.toJS;
    transaction.onabort = fail.toJS;
    return completed.future;
  }
}
