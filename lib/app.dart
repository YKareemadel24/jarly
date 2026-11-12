/// App root: themes from the token palette, the go_router tree, and the
/// system-brightness bridge that lets "system" appearance follow the OS.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/palette.dart';
import 'state/providers.dart';
import 'state/savings_controller.dart' show StoreException;
import 'ui/app_theme.dart';
import 'ui/router.dart';
import 'ui/screens/lock_gate.dart';
import 'ui/widgets/notification_resync.dart';
import 'ui/widgets/storage_warning.dart';

class JarlyApp extends ConsumerStatefulWidget {
  const JarlyApp({super.key});

  @override
  ConsumerState<JarlyApp> createState() => _JarlyAppState();
}

class _JarlyAppState extends ConsumerState<JarlyApp> {
  late final AppLifecycleListener _lifecycle;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onResume: _catchUpRecurring);
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _catchUpRecurring() async {
    if (ref.read(savingsProvider).value?.writable != true) return;
    try {
      await ref.read(savingsProvider.notifier).catchUpRecurring();
    } on StoreException {
      // The controller exposes the failed save through StorageWarning.
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(themeProvider).value ?? AppearanceMode.system;
    final savings = ref.watch(savingsProvider);
    final settings = ref.watch(settingsProvider);
    final savingsReady =
        savings.value?.ready == true && savings.value?.writable == true;
    final settingsReady = settings.value?.ready == true;
    final unavailable =
        savings.hasError ||
        settings.hasError ||
        (savings.hasValue && !savingsReady) ||
        (settings.hasValue && !settingsReady);
    final ready =
        savingsReady &&
        settingsReady &&
        !unavailable &&
        !savings.isLoading &&
        !settings.isLoading;

    return MaterialApp.router(
      title: 'jarly',
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
      theme: buildAppTheme(Palette.light, Brightness.light),
      darkTheme: buildAppTheme(Palette.dark, Brightness.dark),
      themeMode: switch (mode) {
        AppearanceMode.light => ThemeMode.light,
        AppearanceMode.dark => ThemeMode.dark,
        AppearanceMode.system => ThemeMode.system,
      },
      builder: (context, child) {
        // Keep the palette provider in sync with the OS brightness so the
        // "system" appearance is available to non-Material widgets too.
        final brightness = MediaQuery.platformBrightnessOf(context);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final notifier = ref.read(systemBrightnessProvider.notifier);
          if (ref.read(systemBrightnessProvider) != brightness) {
            notifier.update(brightness);
          }
        });
        // The lock gate sits above everything; the resync and storage warning
        // are headless/banner layers from the original root layout.
        return Stack(
          children: [
            if (ready)
              LockGate(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    child ?? const SizedBox.shrink(),
                    const StorageWarning(),
                  ],
                ),
              )
            else
              Material(
                child: SafeArea(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: unavailable
                          ? Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text(
                                  'Savings storage is unavailable.',
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 16),
                                FilledButton(
                                  onPressed: () =>
                                      ref.invalidate(storageProvider),
                                  child: const Text('Try again'),
                                ),
                              ],
                            )
                          : const CircularProgressIndicator(
                              semanticsLabel: 'Loading savings',
                            ),
                    ),
                  ),
                ),
              ),
            const NotificationResync(),
          ],
        );
      },
    );
  }
}
