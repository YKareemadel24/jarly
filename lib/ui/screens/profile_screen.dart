/// Profile: appearance, gentle support (reminders + app lock), currency,
/// device transfer, backups, and the archived-jar history.
///
/// Port of `app/(tabs)/profile.tsx` + `components/profile.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/hex_color.dart';
import '../../core/theme/palette.dart';
import '../../data/settings_repository.dart'
    show maxPinLength, minPinLength, supportedCurrencies;
import '../../domain/domain.dart';
import '../../services/haptics.dart';
import '../../services/notification_service.dart';
import '../../state/providers.dart';
import '../widgets/action_sheet.dart';
import '../widgets/screen_container.dart';
import '../widgets/sheet_scaffold.dart';

/// Which PIN prompt the sheet is showing.
enum _PinPromptMode { setup, change, verifyPinDisable, verifyBiometricDisable }

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  _PinPromptMode? _pinMode;
  String? _notice;
  Jar? _pendingDelete;
  bool _currencyPickerOpen = false;
  bool _pinBusy = false;

  void _openPinPrompt(_PinPromptMode mode) =>
      setState(() => _pinMode = mode);

  void _closePinPrompt() => setState(() {
        _pinMode = null;
      });

  void _showNotice(String message) => setState(() => _notice = message);

  /// Returns the error to show under the field, or null once the prompt
  /// should close.
  Future<String?> _submitPin(String pinInput) async {
    final settings = ref.read(settingsProvider).value;
    final controller = ref.read(settingsProvider.notifier);
    final mode = _pinMode;
    if (mode == null || _pinBusy) return null;
    setState(() => _pinBusy = true);
    try {
      if (mode == _PinPromptMode.verifyPinDisable ||
          mode == _PinPromptMode.verifyBiometricDisable) {
        final expected = settings?.pinLength ?? minPinLength;
        if (pinInput.length != expected) {
          return 'Enter your current PIN.';
        }
        final result = await controller.tryUnlock(pinInput);
        if (result != 'ok') {
          return result == 'locked'
              ? 'Too many tries. Wait before trying again.'
              : 'That PIN didn’t match.';
        }
        if (mode == _PinPromptMode.verifyPinDisable) {
          await controller.disablePinLock();
        } else {
          controller.setBiometricLockEnabled(false);
        }
        _closePinPrompt();
        return null;
      }
      if (pinInput.length < minPinLength) {
        return 'Use $minPinLength or more digits.';
      }
      final ok = await controller.setPin(pinInput);
      if (!ok) {
        return 'Could not save that PIN. Try again.';
      }
      if (mode == _PinPromptMode.setup && !(await controller.enablePinLock())) {
        return 'Could not enable the PIN lock. Try again.';
      }
      _closePinPrompt();
      return null;
    } finally {
      if (mounted) setState(() => _pinBusy = false);
    }
  }

  Future<void> _onPinLockChange(bool next) async {
    final settings = ref.read(settingsProvider).value;
    final controller = ref.read(settingsProvider.notifier);
    if (next) {
      if (settings?.hasPin ?? false) {
        final ok = await controller.enablePinLock();
        if (!ok) _showNotice('Could not enable the PIN lock. Try again.');
      } else {
        _openPinPrompt(_PinPromptMode.setup);
      }
    } else if ((settings?.biometricLockEnabled ?? false) &&
        (settings?.biometricAvailable ?? false)) {
      final ok = await controller.authenticateWithBiometrics();
      if (ok) {
        await controller.disablePinLock();
      } else {
        _showNotice('Verify with biometrics before turning off the PIN lock.');
      }
    } else {
      _openPinPrompt(_PinPromptMode.verifyPinDisable);
    }
  }

  Future<void> _onBiometricLockChange(bool next) async {
    final settings = ref.read(settingsProvider).value;
    final controller = ref.read(settingsProvider.notifier);
    if (next) {
      controller.setBiometricLockEnabled(true);
      return;
    }
    if (!(settings?.biometricLockEnabled ?? false)) return;
    if (settings?.biometricAvailable ?? false) {
      final ok = await controller.authenticateWithBiometrics();
      if (ok) {
        controller.setBiometricLockEnabled(false);
      } else {
        _showNotice(
            'Verify with biometrics before turning off fingerprint unlock.');
      }
    } else if (settings?.hasPin ?? false) {
      _openPinPrompt(_PinPromptMode.verifyBiometricDisable);
    } else {
      _showNotice(
          'Authentication is unavailable. Restore device biometrics before changing this lock.');
    }
  }

  Future<void> _onRemindersChange(bool next) async {
    final controller = ref.read(settingsProvider.notifier);
    if (!next) {
      controller.setRemindersEnabled(false);
      return;
    }
    try {
      final granted = await requestNotificationPermission();
      if (granted) {
        controller.setRemindersEnabled(true);
      } else {
        _showNotice(
            'Saving reminders stays off until you allow notifications in system Settings.');
      }
    } catch (_) {
      _showNotice('Could not check notification permission. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final settings = ref.watch(settingsProvider).value;
    final savings = ref.watch(savingsProvider).value;
    final jars = savings?.jars ?? const <Jar>[];
    final format = ref.watch(moneyFormatterProvider);
    final appearance =
        ref.watch(themeProvider).value ?? AppearanceMode.system;
    final currency = settings?.currency ?? 'USD';
    final activeCurrency = supportedCurrencies.firstWhere(
      (option) => option.code == currency,
      orElse: () => supportedCurrencies.first,
    );
    final archived = jars.where((jar) => jar.isArchived).toList();

    return ScreenContainer(
      scrollable: true,
      child: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.only(bottom: 36),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('PROFILE',
                    style: TextStyle(
                        color: palette.muted,
                        fontSize: 10,
                        letterSpacing: 1.4,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 7),
                Text('Make it feel\nlike yours.',
                    style: TextStyle(
                        color: palette.foreground,
                        fontSize: 31,
                        height: 36 / 31)),
                const SizedBox(height: 23),

                // Identity
                Container(
                  constraints: const BoxConstraints(minHeight: 82),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: palette.surface,
                    borderRadius: BorderRadius.circular(23),
                    border: Border.all(color: palette.border),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: palette.primary,
                          borderRadius: BorderRadius.circular(17),
                        ),
                        child: const Text('SJ',
                            style: TextStyle(
                                color: Color(0xFFFFFDF9), fontSize: 16)),
                      ),
                      const SizedBox(width: 13),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Your Saving Jar',
                                style: TextStyle(
                                    color: palette.foreground,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 4),
                            Text('A private progress tracker',
                                style: TextStyle(
                                    color: palette.muted, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                _sectionLabel(palette, 'APPEARANCE'),
                _group(palette, [
                  Text('Theme',
                      style: TextStyle(
                          color: palette.foreground,
                          fontSize: 14,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('Choose the view that feels most comfortable.',
                      style: TextStyle(color: palette.muted, fontSize: 12)),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      for (final mode in AppearanceMode.values) ...[
                        if (mode != AppearanceMode.light) const SizedBox(width: 7),
                        Expanded(child: _themeChoice(palette, mode, appearance)),
                      ],
                    ],
                  ),
                ]),

                _sectionLabel(palette, 'GENTLE SUPPORT'),
                _group(palette, [
                  _Preference(
                    icon: Icons.notifications_none,
                    title: 'Saving reminders',
                    detail:
                        'Daily savings check-in plus due deposit and deadline nudges',
                    value: settings?.remindersEnabled ?? false,
                    onChange: _onRemindersChange,
                    palette: palette,
                  ),
                  _line(palette),
                  _Preference(
                    icon: Icons.fingerprint,
                    title: 'Fingerprint unlock',
                    detail: settings?.biometricAvailable ?? false
                        ? 'Require your fingerprint or face to open your jar'
                        : 'Set up fingerprint or face unlock on this device to use this',
                    value: (settings?.biometricLockEnabled ?? false) &&
                        (settings?.biometricAvailable ?? false),
                    onChange: _onBiometricLockChange,
                    disabled: !(settings?.biometricAvailable ?? false),
                    palette: palette,
                  ),
                  _line(palette),
                  _Preference(
                    icon: Icons.lock_outline,
                    title: 'PIN lock',
                    detail:
                        'Use a 4–12 digit code if you\'d rather not use biometrics',
                    value: settings?.pinLockEnabled ?? false,
                    onChange: _onPinLockChange,
                    palette: palette,
                  ),
                  _line(palette),
                  _prefAction(
                    palette,
                    icon: Icons.key,
                    title: '${settings?.hasPin ?? false ? 'Change' : 'Set'} PIN',
                    detail: !(settings?.pinLockEnabled ?? false)
                        ? 'Turn on PIN lock first.'
                        : (settings?.hasPin ?? false)
                            ? 'Update the code that unlocks your jar.'
                            : 'Choose a code so only you can open it.',
                    enabled: settings?.pinLockEnabled ?? false,
                    showChevron: settings?.pinLockEnabled ?? false,
                    onTap: () {
                      if (!(settings?.pinLockEnabled ?? false)) return;
                      _openPinPrompt(settings?.hasPin ?? false
                          ? _PinPromptMode.change
                          : _PinPromptMode.setup);
                    },
                  ),
                ]),

                _sectionLabel(palette, 'PREFERENCES'),
                _roundRow(
                  palette,
                  onTap: () => setState(() => _currencyPickerOpen = true),
                  semantics: 'Choose a currency',
                  child: Row(
                    children: [
                      _prefIcon(palette, Icons.attach_money),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Default currency',
                                style: TextStyle(
                                    color: palette.foreground,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 3),
                            Text(
                                '${activeCurrency.code} — ${activeCurrency.name}',
                                style: TextStyle(
                                    color: palette.muted, fontSize: 11)),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 11, vertical: 7),
                        decoration: BoxDecoration(
                          color: hexAlpha(toRrggbb(palette.primary), '14'),
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Text(activeCurrency.code,
                            style: TextStyle(
                                color: palette.primary,
                                fontSize: 12,
                                fontWeight: FontWeight.w800)),
                      ),
                      Icon(Icons.chevron_right,
                          size: 20, color: palette.muted),
                    ],
                  ),
                ),

                _sectionLabel(palette, 'YOUR DEVICES'),
                _roundRow(
                  palette,
                  onTap: () => context.push('/transfer'),
                  semantics: 'Move jars to another device',
                  child: Row(
                    children: [
                      _prefIcon(palette, Icons.devices),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Move to another device',
                                style: TextStyle(
                                    color: palette.foreground,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 3),
                            Text(
                                'Pass your jars across with a code — no account, no network.',
                                style: TextStyle(
                                    color: palette.muted, fontSize: 11)),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 20, color: palette.muted),
                    ],
                  ),
                ),

                _sectionLabel(palette, 'ARCHIVED'),
                _group(
                  palette,
                  archived.isEmpty
                      ? [
                          Text(
                            'Nothing archived. Archiving removes a jar from your active goals while keeping its history.',
                            style:
                                TextStyle(color: palette.muted, fontSize: 12),
                          ),
                        ]
                      : [
                          for (var index = 0; index < archived.length; index++)
                            if (index == 0)
                              _archivedRow(palette, archived[index], format)
                            else ...[
                              _line(palette),
                              _archivedRow(palette, archived[index], format),
                            ],
                        ],
                ),
              ],
            ),
          ),

          // Overlays live in the same Stack so they cover the scroll view.
          if (_currencyPickerOpen)
            _currencySheet(palette, currency),
          if (_pinMode != null)
            _PinSheet(
              mode: _pinMode!,
              busy: _pinBusy,
              palette: palette,
              onClose: _closePinPrompt,
              onSubmit: _submitPin,
            ),
          ActionSheet(
            visible: _notice != null,
            title: 'Notifications off',
            message: _notice ?? '',
            actions: [
              SheetAction(label: 'Got it', onPress: () {}),
            ],
            onDismiss: () => setState(() => _notice = null),
          ),
          ActionSheet(
            visible: _pendingDelete != null,
            title: 'Delete forever?',
            message: _pendingDelete != null
                ? '${_pendingDelete!.name} and its history will be permanently removed.'
                : '',
            actions: [
              SheetAction(
                label: 'Delete',
                detail: 'This cannot be undone.',
                destructive: true,
                icon: Icons.delete_outline,
                onPress: () {
                  final jar = _pendingDelete;
                  if (jar != null) {
                    ref.read(savingsProvider.notifier).deleteJarPermanently(jar.id);
                  }
                },
              ),
              SheetAction(label: 'Cancel', onPress: () {}),
            ],
            onDismiss: () => setState(() => _pendingDelete = null),
          ),
        ],
      ),
    );
  }

  /* ------------------------------- Fragments ------------------------------- */

  Widget _sectionLabel(Palette palette, String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 26, bottom: 9),
      child: Text(text,
          style: TextStyle(
              color: palette.muted,
              fontSize: 10,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w800)),
    );
  }

  Widget _group(Palette palette, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(21),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }

  Widget _line(Palette palette) => Container(
        height: 0.5,
        margin: const EdgeInsets.only(left: 48),
        color: palette.border,
      );

  Widget _prefIcon(Palette palette, IconData icon) {
    return Container(
      width: 37,
      height: 37,
      decoration: BoxDecoration(
        color: hexAlpha(toRrggbb(palette.primary), '12'),
        borderRadius: BorderRadius.circular(13),
      ),
      child: Icon(icon, size: 19, color: palette.primary),
    );
  }

  Widget _themeChoice(Palette palette, AppearanceMode mode, AppearanceMode current) {
    final selected = mode == current;
    return GestureDetector(
      onTap: () =>
          ref.read(themeProvider.notifier).setMode(mode),
      child: Container(
        constraints: const BoxConstraints(minHeight: 40),
        decoration: BoxDecoration(
          color: selected ? palette.primary : null,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? palette.primary : palette.border),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              switch (mode) {
                AppearanceMode.light => Icons.light_mode,
                AppearanceMode.dark => Icons.dark_mode,
                AppearanceMode.system => Icons.brightness_auto,
              },
              size: 17,
              color: selected ? const Color(0xFFFFFDF9) : palette.muted,
            ),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                switch (mode) {
                  AppearanceMode.light => 'Light',
                  AppearanceMode.dark => 'Dark',
                  AppearanceMode.system => 'Auto',
                },
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: selected ? const Color(0xFFFFFDF9) : palette.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _prefAction(
    Palette palette, {
    required IconData icon,
    required String title,
    required String detail,
    required bool enabled,
    required bool showChevron,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedOpacity(
        opacity: enabled ? 1 : 0.45,
        duration: const Duration(milliseconds: 120),
        child: Container(
          constraints: const BoxConstraints(minHeight: 57),
          child: Row(
            children: [
              _prefIcon(palette, icon),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(title,
                        style: TextStyle(
                            color: palette.foreground,
                            fontSize: 13,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(height: 3),
                    Text(detail,
                        style: TextStyle(color: palette.muted, fontSize: 11)),
                  ],
                ),
              ),
              if (showChevron)
                Icon(Icons.chevron_right, size: 20, color: palette.muted),
            ],
          ),
        ),
      ),
    );
  }

  Widget _roundRow(
    Palette palette, {
    required Widget child,
    VoidCallback? onTap,
    String? semantics,
  }) {
    return Semantics(
      button: true,
      label: semantics,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 65),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: palette.border),
          ),
          child: child,
        ),
      ),
    );
  }

  Widget _archivedRow(
      Palette palette, Jar jar, String Function(int) format) {
    return Container(
      constraints: const BoxConstraints(minHeight: 57),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(jar.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        color: palette.foreground,
                        fontSize: 13,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 3),
                Text('${format(jar.balance)} saved',
                    style: TextStyle(color: palette.muted, fontSize: 11)),
              ],
            ),
          ),
          GestureDetector(
            onTap: () {
              Haptics.tap();
              ref.read(savingsProvider.notifier).restoreJar(jar.id);
            },
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
              decoration: BoxDecoration(
                color: hexAlpha(toRrggbb(palette.primary), '14'),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Text('Restore',
                  style: TextStyle(
                      color: palette.primary,
                      fontSize: 12,
                      fontWeight: FontWeight.w800)),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => setState(() => _pendingDelete = jar),
            child: Icon(Icons.delete_outline, size: 20, color: palette.muted),
          ),
        ],
      ),
    );
  }

  Widget _currencySheet(Palette palette, String currency) {
    return SheetScaffold(
      visible: true,
      onDismiss: () => setState(() => _currencyPickerOpen = false),
      palette: palette,
      centerCard: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Choose a currency',
                    style:
                        TextStyle(color: palette.foreground, fontSize: 20)),
              ),
              GestureDetector(
                onTap: () => setState(() => _currencyPickerOpen = false),
                child: Icon(Icons.close, size: 20, color: palette.muted),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text('All amounts in the app will display in this currency.',
              style: TextStyle(color: palette.muted, fontSize: 12)),
          const SizedBox(height: 12),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 360),
            child: SingleChildScrollView(
              child: Column(
                children: [
                  for (final option in supportedCurrencies)
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        Haptics.tap();
                        ref.read(settingsProvider.notifier).setCurrency(option.code);
                        setState(() => _currencyPickerOpen = false);
                      },
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 57),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            Container(
                              width: 37,
                              height: 37,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: option.code == currency
                                    ? hexAlpha(
                                        toRrggbb(palette.primary), '22')
                                    : palette.background,
                                borderRadius: BorderRadius.circular(13),
                                border: Border.all(
                                    color: option.code == currency
                                        ? palette.primary
                                        : palette.border),
                              ),
                              child: Text(option.symbol,
                                  style: TextStyle(
                                      color: option.code == currency
                                          ? palette.primary
                                          : palette.muted,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800)),
                            ),
                            const SizedBox(width: 11),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(option.name,
                                      style: TextStyle(
                                          color: palette.foreground,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w800)),
                                  const SizedBox(height: 3),
                                  Text(option.code,
                                      style: TextStyle(
                                          color: palette.muted, fontSize: 11)),
                                ],
                              ),
                            ),
                            if (option.code == currency)
                              Icon(Icons.check,
                                  size: 20, color: palette.primary),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------ Preference row ----------------------------- */

class _Preference extends StatelessWidget {
  const _Preference({
    required this.icon,
    required this.title,
    required this.detail,
    required this.value,
    required this.onChange,
    required this.palette,
    this.disabled = false,
  });

  final IconData icon;
  final String title;
  final String detail;
  final bool value;
  final Future<void> Function(bool) onChange;
  final Palette palette;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 57),
      child: Row(
        children: [
          Container(
            width: 37,
            height: 37,
            decoration: BoxDecoration(
              color: hexAlpha(toRrggbb(palette.primary), '12'),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(icon, size: 19, color: palette.primary),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(title,
                    style: TextStyle(
                        color: palette.foreground,
                        fontSize: 13,
                        fontWeight: FontWeight.w800)),
                const SizedBox(height: 3),
                Text(detail,
                    style: TextStyle(color: palette.muted, fontSize: 11)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: disabled ? null : (next) => onChange(next),
            activeThumbColor: palette.primary,
            inactiveThumbColor: const Color(0xFFFFFDF9),
            activeTrackColor: hexAlpha(toRrggbb(palette.primary), '8C'),
            inactiveTrackColor: palette.border,
            trackOutlineColor: const WidgetStatePropertyAll(
                Color(0x00000000)),
          ),
        ],
      ),
    );
  }
}

/* -------------------------------- PIN sheet -------------------------------- */

class _PinSheet extends StatefulWidget {
  const _PinSheet({
    required this.mode,
    required this.busy,
    required this.palette,
    required this.onClose,
    required this.onSubmit,
  });

  final _PinPromptMode mode;
  final bool busy;
  final Palette palette;
  final VoidCallback onClose;
  final Future<String?> Function(String pin) onSubmit;

  @override
  State<_PinSheet> createState() => _PinSheetState();
}

class _PinSheetState extends State<_PinSheet> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final error = await widget.onSubmit(_controller.text);
    if (mounted) setState(() => _error = error);
  }

  @override
  Widget build(BuildContext context) {
    final palette = widget.palette;
    final verifying = widget.mode == _PinPromptMode.verifyPinDisable ||
        widget.mode == _PinPromptMode.verifyBiometricDisable;
    return SheetScaffold(
      visible: true,
      onDismiss: widget.onClose,
      palette: palette,
      centerCard: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  switch (widget.mode) {
                    _PinPromptMode.setup => 'Choose your PIN',
                    _PinPromptMode.change => 'Change your PIN',
                    _ => 'Verify your PIN',
                  },
                  style: TextStyle(color: palette.foreground, fontSize: 20),
                ),
              ),
              GestureDetector(
                onTap: widget.onClose,
                child: Icon(Icons.close, size: 20, color: palette.muted),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            verifying
                ? 'Confirm your PIN before changing the app lock.'
                : 'Use $minPinLength or more digits. You’ll be asked for it each time the app opens.',
            style: TextStyle(color: palette.muted, fontSize: 12),
          ),
          TextField(
            controller: _controller,
            autofocus: true,
            obscureText: true,
            keyboardType: TextInputType.number,
            maxLength: maxPinLength,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            onChanged: (_) => setState(() => _error = null),
            onSubmitted: (_) => _submit(),
            style: TextStyle(
                color: palette.foreground,
                fontSize: 22,
                letterSpacing: 8),
            decoration: InputDecoration(
              hintText: '••••',
              hintStyle: TextStyle(color: palette.muted),
              counterText: '',
              filled: true,
              fillColor: palette.background,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: BorderSide(
                    color: _error != null ? palette.error : palette.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(15),
                borderSide: BorderSide(
                    color: _error != null ? palette.error : palette.border),
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(_error!,
                  style: TextStyle(
                      color: palette.error,
                      fontSize: 12,
                      fontWeight: FontWeight.w700)),
            ),
          GestureDetector(
            onTap: _pinBusyGuard,
            child: Container(
              margin: const EdgeInsets.only(top: 18),
              constraints: const BoxConstraints(minHeight: 50),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: palette.primary,
                borderRadius: BorderRadius.circular(15),
              ),
              child: widget.busy
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: palette.background))
                  : Text(
                      switch (widget.mode) {
                        _PinPromptMode.setup => 'Turn on PIN lock',
                        _ => verifying ? 'Verify PIN' : 'Save PIN',
                      },
                      style: const TextStyle(
                          color: Color(0xFFFFFDF9),
                          fontSize: 14,
                          fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }

  void _pinBusyGuard() {
    if (!widget.busy) _submit();
  }
}
