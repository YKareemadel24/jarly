/// App root: themes from the token palette, the go_router tree, and the
/// system-brightness bridge that lets "system" appearance follow the OS.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/palette.dart';
import 'state/providers.dart';
import 'ui/app_theme.dart';
import 'ui/router.dart';
import 'ui/screens/lock_gate.dart';
import 'ui/widgets/notification_resync.dart';
import 'ui/widgets/storage_warning.dart';

class JarlyApp extends ConsumerWidget {
  const JarlyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeProvider).value ?? AppearanceMode.system;

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
            child ?? const SizedBox.shrink(),
            const NotificationResync(),
            const StorageWarning(),
            const LockGate(),
          ],
        );
      },
    );
  }
}
