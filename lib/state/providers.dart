/// Riverpod provider declarations and the appearance-mode controller.
library;

import 'package:flutter/material.dart' show Brightness;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/palette.dart';
import '../data/key_value_storage.dart';
import '../data/settings_repository.dart' show appearanceKey;
import '../domain/domain.dart';
import 'savings_controller.dart';
import 'settings_controller.dart';

/// Platform key/value storage, initialized once.
final storageProvider = FutureProvider<KeyValueStorage>((ref) => createStorage());

final savingsProvider =
    AsyncNotifierProvider<SavingsController, SavingsState>(SavingsController.new);

final settingsProvider =
    AsyncNotifierProvider<SettingsController, SettingsState>(SettingsController.new);

/// The system brightness, fed from the widget tree so appearance can follow it.
class SystemBrightness extends Notifier<Brightness> {
  @override
  Brightness build() => Brightness.light;

  void update(Brightness value) => state = value;
}

final systemBrightnessProvider =
    NotifierProvider<SystemBrightness, Brightness>(SystemBrightness.new);

/// Appearance preference: light, dark, or follow the system.
enum AppearanceMode { light, dark, system }

String appearanceToString(AppearanceMode mode) => switch (mode) {
      AppearanceMode.light => 'light',
      AppearanceMode.dark => 'dark',
      AppearanceMode.system => 'system',
    };

AppearanceMode? appearanceFromString(String? value) => switch (value) {
      'light' => AppearanceMode.light,
      'dark' => AppearanceMode.dark,
      'system' => AppearanceMode.system,
      _ => null,
    };

class ThemeController extends AsyncNotifier<AppearanceMode> {
  static const _key = appearanceKey;

  @override
  Future<AppearanceMode> build() async {
    final storage = await ref.watch(storageProvider.future);
    try {
      final raw = await storage.getItem(_key);
      return appearanceFromString(raw) ?? AppearanceMode.system;
    } catch (_) {
      return AppearanceMode.system;
    }
  }

  Future<void> setMode(AppearanceMode mode) async {
    state = AsyncData(mode);
    try {
      final storage = await ref.read(storageProvider.future);
      await storage.setItem(_key, appearanceToString(mode));
    } catch (_) {
      // Preference persistence is best effort.
    }
  }
}

final themeProvider =
    AsyncNotifierProvider<ThemeController, AppearanceMode>(ThemeController.new);

/// The effective palette given the user's appearance preference and the
/// current system brightness.
final paletteProvider = Provider<Palette>((ref) {
  final mode = ref.watch(themeProvider).value ?? AppearanceMode.system;
  final system = ref.watch(systemBrightnessProvider);
  final isDark = switch (mode) {
    AppearanceMode.light => false,
    AppearanceMode.dark => true,
    AppearanceMode.system => system == Brightness.dark,
  };
  return Palette.of(isDark ? Brightness.dark : Brightness.light);
});

/// Returns a money(minor) formatter bound to the user's active currency.
final moneyFormatterProvider = Provider<String Function(int)>((ref) {
  final settings = ref.watch(settingsProvider).value;
  final currency = settings?.currency ?? 'USD';
  return (int minor) => money(minor, currency);
});
