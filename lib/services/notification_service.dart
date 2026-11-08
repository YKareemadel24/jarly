/// Local notification plumbing around flutter_local_notifications.
///
/// Port of the platform half of `lib/notifications.ts` (the pure scheduling
/// derivation lives in `lib/notifications/due_notifications.dart`). Web is a
/// no-op everywhere, matching the original's lazy expo-notifications loader.
library;

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

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
