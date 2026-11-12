/// Checks IndexedDB commit acknowledgement and aborted-write retry in a browser.
@TestOn('browser')
library;

import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:flutter_test/flutter_test.dart';
import 'package:web/web.dart' as web;

import 'package:jarly/data/key_value_storage.dart';
import 'package:jarly/data/savings_storage.dart';
import 'package:jarly/services/ledger_storage_web.dart';

void main() {
  late web.IDBDatabase database;
  late String databaseName;

  setUp(() async {
    databaseName = 'jarly-ledger-test-${DateTime.now().microsecondsSinceEpoch}';
    final request = web.window.indexedDB.open(databaseName, 1);
    final opened = Completer<web.IDBDatabase>();
    request.onupgradeneeded = ((web.Event _) {
      (request.result as web.IDBDatabase).createObjectStore('ledger');
    }).toJS;
    request.onsuccess = ((web.Event _) {
      opened.complete(request.result as web.IDBDatabase);
    }).toJS;
    request.onerror = ((web.Event _) {
      opened.completeError(StateError('Could not open test database.'));
    }).toJS;
    database = await opened.future;
  });

  tearDown(() async {
    database.close();
    final deleted = Completer<void>();
    final request = web.window.indexedDB.deleteDatabase(databaseName);
    request.onsuccess = ((web.Event _) => deleted.complete()).toJS;
    request.onerror = ((web.Event _) {
      deleted.completeError(StateError('Could not delete test database.'));
    }).toJS;
    await deleted.future;
  });

  test(
    'write success waits for strict transaction completion and survives reopen',
    () async {
      var committed = false;
      var durability = '';
      final proxy = JSObject();
      proxy['transaction'] =
          ((JSAny names, String mode, web.IDBTransactionOptions? options) {
            final transaction = options == null
                ? database.transaction(names, mode)
                : database.transaction(names, mode, options);
            if (mode == 'readwrite') {
              committed = false;
              durability = transaction.durability;
              transaction.addEventListener(
                'complete',
                ((web.Event _) {
                  committed = true;
                }).toJS,
              );
            }
            return transaction;
          }).toJS;
      final preferences = MemoryStorage({
        jarsKey: 'old',
        jarsBackupKey: 'backup',
      });
      final storage = await IndexedDbLedgerStorage(
        proxy as web.IDBDatabase,
        preferences,
      ).initialize();

      await storage.setItem(jarsKey, 'new');
      expect(committed, isTrue);
      expect(durability, 'strict');
      final reopened = await IndexedDbLedgerStorage(
        database,
        MemoryStorage(),
      ).initialize();
      expect(await reopened.getItem(jarsKey), 'new');
      expect(await reopened.getItem(jarsBackupKey), 'backup');
      expect(preferences.values[jarsKey], 'old');
    },
  );

  test(
    'aborted transaction rejects the write and a later retry succeeds',
    () async {
      var abortWrite = false;
      final proxy = JSObject();
      proxy['transaction'] =
          ((JSAny names, String mode, web.IDBTransactionOptions? options) {
            final transaction = options == null
                ? database.transaction(names, mode)
                : database.transaction(names, mode, options);
            if (mode == 'readwrite' && abortWrite) {
              scheduleMicrotask(() => transaction.abort());
            }
            return transaction;
          }).toJS;
      final storage = await IndexedDbLedgerStorage(
        proxy as web.IDBDatabase,
        MemoryStorage({jarsKey: 'committed'}),
      ).initialize();

      abortWrite = true;
      await expectLater(
        storage.setItem(jarsKey, 'failed'),
        throwsA(isA<StateError>()),
      );
      expect(await storage.getItem(jarsKey), 'committed');
      final reopened = await IndexedDbLedgerStorage(
        database,
        MemoryStorage(),
      ).initialize();
      expect(await reopened.getItem(jarsKey), 'committed');

      abortWrite = false;
      await storage.setItem(jarsKey, 'retry');
      final retried = await IndexedDbLedgerStorage(
        database,
        MemoryStorage(),
      ).initialize();
      expect(await retried.getItem(jarsKey), 'retry');
    },
  );
}
