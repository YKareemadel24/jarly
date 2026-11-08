/// Headless listener that re-runs the OS notification schedule whenever jars,
/// the reminders preference, or the app lifecycle change.
///
/// Port of `components/notification-resync.tsx`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/notification_service.dart';
import '../../state/providers.dart';

class NotificationResync extends ConsumerStatefulWidget {
  const NotificationResync({super.key});

  @override
  ConsumerState<NotificationResync> createState() => _NotificationResyncState();
}

class _NotificationResyncState extends ConsumerState<NotificationResync>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-runs the OS schedule on foreground, so catch-ups missed while
    // backgrounded are healed on return.
    if (state == AppLifecycleState.resumed) _resync();
  }

  void _resync() {
    final savings = ref.read(savingsProvider).value;
    final settings = ref.read(settingsProvider).value;
    final savingsUnavailable = savings?.storageError != null;
    resyncNotifications(
      savings?.jars ?? const [],
      enabled: (settings?.remindersEnabled ?? false) && !savingsUnavailable,
      currency: settings?.currency ?? 'USD',
      now: DateTime.now(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final savings = ref.watch(savingsProvider).value;
    final settings = ref.watch(settingsProvider).value;
    final savingsReady = savings?.ready ?? false;
    final savingsUnavailable = savings?.storageError != null;
    final settingsReady = settings?.ready ?? false;

    // Matching the original gate: only resync when savings have loaded and
    // either settings have loaded or storage is known-broken (so schedules
    // get cleared rather than left stale).
    if (savingsReady && (savingsUnavailable || settingsReady)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _resync();
      });
    }
    return const SizedBox.shrink();
  }
}
