/// Local notification plumbing around flutter_local_notifications.
///
/// Port of the platform half of `lib/notifications.ts` (the pure scheduling
/// derivation lives in `lib/notifications/due_notifications.dart`). Web is a
/// no-op everywhere, matching the original's lazy expo-notifications loader.
library;

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

import '../notifications/due_notifications.dart' show dueNotifications;
import '../domain/domain.dart' show Jar, money;

const String remindersChannelId = 'reminders';
const String remindersChannelName = 'Saving reminders';

FlutterLocalNotificationsPlugin? _plugin;

/// True when this target can talk to the OS notification APIs at all.
bool get notificationsSupported => !kIsWeb;

Future<FlutterLocalNotificationsPlugin?> _notifications() async {
  if (!notificationsSupported) return null;
  if (_plugin != null) return _plugin!;
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
      windows: WindowsInitializationSettings(
        appName: 'jarly',
        appUserModelId: 'com.jarly.app',
        guid: 'b7d94a17-6f2e-4a58-9c3d-1e0a5f8b2c64',
      ),
    ),
  );
  _plugin = plugin;
  return plugin;
}

/// Ensure the Android notification channel exists.
Future<void> _ensureAndroidChannel(FlutterLocalNotificationsPlugin api) async {
  if (defaultTargetPlatform != TargetPlatform.android) return;
  await api
      .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      ?.createNotificationChannel(const AndroidNotificationChannel(
        remindersChannelId,
        remindersChannelName,
        importance: Importance.defaultImportance,
      ));
}

/// Ask the OS for permission once. Returns true only when alerts can fire.
Future<bool> requestNotificationPermission() async {
  final api = await _notifications();
  if (api == null) return false;
  try {
    await _ensureAndroidChannel(api);
    if (defaultTargetPlatform == TargetPlatform.android) {
      final android = api.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      return await android?.requestNotificationsPermission() ?? false;
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      final ios = api.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      final granted = await ios?.requestPermissions(
        alert: true,
        badge: false,
        sound: false,
      );
      return granted ?? false;
    }
    // Windows and other desktop targets do not gate on a runtime permission.
    return true;
  } catch (_) {
    return false;
  }
}

/// Whether the OS will currently deliver our notifications.
Future<bool> notificationsGranted() async {
  final api = await _notifications();
  if (api == null) return false;
  try {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return await api
              .resolvePlatformSpecificImplementation<
                  AndroidFlutterLocalNotificationsPlugin>()
              ?.areNotificationsEnabled() ??
          false;
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      final permissions = await api
          .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin>()
          ?.checkPermissions();
      return permissions?.isEnabled ?? false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

/* ------------------------------- Scheduling -------------------------------- */

bool _timeZonesReady = false;

Future<void> _ensureTimeZones() async {
  if (_timeZonesReady) return;
  tz.initializeTimeZones();
  try {
    final name = (await FlutterTimezone.getLocalTimezone()).identifier;
    tz.setLocalLocation(tz.getLocation(name));
  } catch (_) {
    // Fall back to UTC — absolute instants still fire, only DST-anchored
    // daily repetition would drift. Better than crashing the resync.
  }
  _timeZonesReady = true;
}

/// Rebuild the OS schedule from current jars. Cancel-all-then-schedule keeps
/// edits, deposits, and recurring catch-ups self-healing. Web is a no-op.
Future<void> rebuildNotifications(
  List<Jar> jars, {
  required bool enabled,
  String currency = 'USD',
  DateTime? now,
}) async {
  final api = await _notifications();
  if (api == null) return;
  await api.cancelAll();
  if (!enabled) return;
  await _ensureAndroidChannel(api);
  await _ensureTimeZones();
  if (!(await notificationsGranted())) return;
  final nowDate = now ?? DateTime.now();
  final total = jars
      .where((jar) => !jar.isArchived)
      .fold<int>(0, (sum, jar) => sum + jar.balance);

  await api.zonedSchedule(
    id: _checkInId,
    title: 'Your savings check-in',
    body: 'Current savings: ${money(total, currency)}. Add a little more today.',
    scheduledDate: _zoned(DateTime(nowDate.year, nowDate.month, nowDate.day, 9)),
    notificationDetails: _details(),
    androidScheduleMode: AndroidScheduleMode.inexact,
    // Repeat every day at 09:00 local time, DST-correct.
    matchDateTimeComponents: DateTimeComponents.time,
  );
  var id = _checkInId;
  for (final ping in dueNotifications(jars, nowDate, currency)) {
    id += 1;
    await api.zonedSchedule(
      id: id,
      title: ping.title,
      body: ping.detail,
      scheduledDate: _zoned(DateTime.parse(ping.fireDate)),
      notificationDetails: _details(),
      androidScheduleMode: AndroidScheduleMode.inexact,
    );
  }
}

const int _checkInId = 1;

NotificationDetails _details() => const NotificationDetails(
      android: AndroidNotificationDetails(
        remindersChannelId,
        remindersChannelName,
        importance: Importance.defaultImportance,
        priority: Priority.defaultPriority,
      ),
      iOS: DarwinNotificationDetails(),
    );

tz.TZDateTime _zoned(DateTime local) => tz.TZDateTime.from(local, tz.local);

/* --------------------------------- Resync ---------------------------------- */

({List<Jar> jars, bool enabled, String currency, DateTime now})? _pendingResync;
Future<void>? _resyncTask;

/// Coalesce bursts of state changes into one OS rebuild. Mirrors the queue in
/// the original `resyncNotifications`, so rapid deposits or edits never race
/// the plugin — only the newest inputs survive.
Future<void> resyncNotifications(
  List<Jar> jars, {
  required bool enabled,
  String currency = 'USD',
  DateTime? now,
}) async {
  if (!notificationsSupported) return Future.value();
  _pendingResync = (jars: jars, enabled: enabled, currency: currency, now: now ?? DateTime.now());
  _resyncTask ??= () async {
    while (_pendingResync != null) {
      final request = _pendingResync!;
      _pendingResync = null;
      try {
        await rebuildNotifications(
          request.jars,
          enabled: request.enabled,
          currency: request.currency,
          now: request.now,
        );
      } catch (_) {
        // Scheduling is best-effort; the next foreground resync retries.
      }
    }
    _resyncTask = null;
  }();
  return _resyncTask;
}
