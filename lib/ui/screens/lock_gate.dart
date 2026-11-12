/// Full-screen gate that unlocks the app via biometric prompt or PIN,
/// whichever the user has enabled. Renders nothing when no lock is
/// configured, and re-locks whenever the app returns to the foreground.
///
/// Port of `components/lock-screen.tsx`.
library;

import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/hex_color.dart';
import '../../core/theme/palette.dart';
import '../../lock/lock_policy.dart';
import '../../services/haptics.dart';
import '../../state/providers.dart';

class LockGate extends ConsumerStatefulWidget {
  const LockGate({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<LockGate> createState() => _LockGateState();
}

class _LockGateState extends ConsumerState<LockGate>
    with WidgetsBindingObserver {
  bool _shown = true;
  bool _pinShown = false;
  bool _bioPromptedThisShow = false;
  String _pin = '';
  bool _pinError = false;
  bool _unlocking = false;
  String? _bioError;
  Timer? _clock;
  final _routeScope = FocusScopeNode(debugLabel: 'Savings routes');
  FocusNode? _focusBeforeLock;
  bool _routeBlocked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    _clock?.cancel();
    _routeScope.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Widget _withRoute([Widget? gate]) {
    final blocked = gate != null;
    if (blocked != _routeBlocked) {
      _routeBlocked = blocked;
      if (blocked) {
        final current = FocusManager.instance.primaryFocus;
        _focusBeforeLock =
            current != null && current.ancestors.contains(_routeScope)
            ? current
            : null;
      } else {
        final previous = _focusBeforeLock;
        _focusBeforeLock = null;
        if (previous != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted &&
                !_routeBlocked &&
                previous.context?.mounted == true &&
                previous.canRequestFocus) {
              previous.requestFocus();
            }
          });
        }
      }
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        FocusScope(
          node: _routeScope,
          canRequestFocus: !blocked,
          descendantsAreFocusable: !blocked,
          child: ExcludeSemantics(
            excluding: blocked,
            child: IgnorePointer(ignoring: blocked, child: widget.child),
          ),
        ),
        ?gate,
      ],
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-lock whenever the app returns to the foreground.
    if (state == AppLifecycleState.resumed && _anyLock) {
      setState(() {
        _shown = true;
        _pinShown = _canPin && !_canBio;
        _bioPromptedThisShow = false;
      });
    }
  }

  bool get _anyLock => _policy.required;
  bool get _canBio => _policy.canBiometrics;
  bool get _canPin => _policy.canPin;

  LockPolicy get _policy {
    final settings = ref.read(settingsProvider).value;
    return lockPolicy(
      LockPolicyInput(
        ready: settings?.ready ?? false,
        biometricLockEnabled: settings?.biometricLockEnabled ?? false,
        biometricAvailable: settings?.biometricAvailable ?? false,
        pinLockEnabled: settings?.pinLockEnabled ?? false,
        hasPin: settings?.hasPin ?? false,
        native: !kIsWeb,
      ),
    );
  }

  void _promptBio() async {
    if (!_canBio || _unlocking) return;
    setState(() {
      _unlocking = true;
      _bioError = null;
    });
    bool ok = false;
    try {
      ok = await ref
          .read(settingsProvider.notifier)
          .authenticateWithBiometrics();
    } catch (_) {
      if (mounted) {
        setState(() {
          _unlocking = false;
          _bioError = 'Biometrics are unavailable right now.';
        });
        return;
      }
    }
    if (!mounted) return;
    setState(() {
      _unlocking = false;
      if (ok) {
        _shown = false;
        _pinShown = false;
      } else {
        _bioError = 'We couldn\'t verify it. Try again.';
      }
    });
  }

  void _submitPin(String candidate) async {
    final expected = _expectedPinLength;
    if (candidate.length != expected || _unlocking) return;
    setState(() => _unlocking = true);
    String result;
    try {
      result = await ref.read(settingsProvider.notifier).tryUnlock(candidate);
    } catch (_) {
      result = 'wrong';
    }
    if (!mounted) return;
    setState(() {
      _unlocking = false;
      if (result == 'ok') {
        _shown = false;
        _pinShown = false;
        _pin = '';
        _pinError = false;
      } else {
        // "wrong" and "locked" both clear the entry; the lockout message
        // below distinguishes them once the throttle has kicked in.
        _pinError = true;
        _pin = '';
      }
    });
  }

  /// Reset is available only after a successful device biometric check.
  Future<void> _forgotPin() async {
    final settings = ref.read(settingsProvider).value;
    if (!(settings?.biometricAvailable ?? false) || kIsWeb) return;
    final ok = await ref
        .read(settingsProvider.notifier)
        .authenticateWithBiometrics();
    if (!ok) return;
    await ref.read(settingsProvider.notifier).disablePinLock();
    if (!mounted) return;
    setState(() {
      _shown = false;
      _pinShown = false;
      _pin = '';
      _pinError = false;
    });
  }

  int get _expectedPinLength {
    final settings = ref.watch(settingsProvider).value;
    return settings?.pinLength ?? 4;
  }

  void _handleKey(String digit) {
    if (_unlocking || _pin.length >= _expectedPinLength) return;
    Haptics.tap();
    setState(() {
      _pin += digit;
      _pinError = false;
    });
    if (_pin.length == _expectedPinLength) _submitPin(_pin);
  }

  void _erase() {
    if (_pin.isEmpty) return;
    setState(() {
      _pin = _pin.substring(0, _pin.length - 1);
      _pinError = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider).value;
    final ready = settings?.ready ?? false;
    final palette = ref.watch(paletteProvider);

    // React to settings changes: closing the gate when no lock is configured,
    // opening it and choosing the initial panel when one is.
    final anyLock = _anyLock;
    if (!anyLock) {
      if (_shown || _pinShown) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            setState(() {
              _shown = false;
              _pinShown = false;
            });
          }
        });
      }
      return _withRoute();
    }
    if (!_shown && ready) return _withRoute();

    // Keep the pin panel selection in sync with the policy.
    if (!_pinShown && _canPin && !_canBio) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _pinShown = true);
      });
    }

    // Auto-prompt biometrics once the gate shows; PIN is the manual fallback.
    // Prompted once per show — a failed attempt offers a visible retry button
    // rather than re-summoning the system dialog in a loop.
    if (_canBio && !_bioPromptedThisShow) {
      _bioPromptedThisShow = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _promptBio();
      });
    }

    // Tick the lockout countdown while it is active.
    final lockedUntil = settings?.pinLockedUntil;
    final lockedOut =
        lockedUntil != null &&
        lockedUntil > DateTime.now().millisecondsSinceEpoch;
    if (lockedOut) {
      _clock ??= Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else {
      _clock?.cancel();
      _clock = null;
    }
    final lockoutSeconds = lockedOut
        ? ((lockedUntil - DateTime.now().millisecondsSinceEpoch) / 1000)
              .ceil()
              .clamp(1, 3600)
        : 0;

    return _withRoute(
      Positioned.fill(
        child: Material(
          color: palette.background,
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: !ready
                    ? _notReady(palette)
                    : _pinShown || (_canPin && !_canBio)
                    ? _pinPanel(palette, lockedOut, lockoutSeconds)
                    : _bioPanel(palette),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _notReady(Palette palette) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircularProgressIndicator(color: palette.primary),
        const SizedBox(height: 16),
        Text(
          'Security settings could not be loaded. Restart the app to try again.',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.muted, fontSize: 13),
        ),
      ],
    );
  }

  Widget _pinPanel(Palette palette, bool lockedOut, int lockoutSeconds) {
    const keypad = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '',
      '0',
      'back',
    ];
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _mark(palette, Icons.lock),
        const SizedBox(height: 18),
        Text(
          'Your Saving Jar is locked',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.foreground, fontSize: 24),
        ),
        const SizedBox(height: 7),
        Text(
          'Enter your PIN to keep saving.',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.muted, fontSize: 13),
        ),
        if (lockedOut)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(
              'Too many tries. Try again in about ${lockoutSeconds}s.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.error,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          )
        else if (_pinError)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(
              'That PIN didn\'t match. Try again.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.error,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        const SizedBox(height: 26),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var index = 0; index < _expectedPinLength; index++) ...[
              if (index > 0) const SizedBox(width: 14),
              Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: index < _pin.length
                      ? palette.foreground
                      : palette.border,
                ),
              ),
            ],
          ],
        ),
        if (_canBio)
          Padding(
            padding: const EdgeInsets.only(top: 22),
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _pin = '';
                  _pinError = false;
                  _pinShown = false;
                });
                _promptBio();
              },
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: const EdgeInsets.symmetric(horizontal: 18),
                decoration: BoxDecoration(
                  color: hexAlpha(toRrggbb(palette.primary), '14'),
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(
                    color: hexAlpha(toRrggbb(palette.primary), '44'),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.fingerprint, size: 20, color: palette.primary),
                    const SizedBox(width: 8),
                    Text(
                      'Use fingerprint or face',
                      style: TextStyle(
                        color: palette.primary,
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        const SizedBox(height: 28),
        SizedBox(
          width: 264,
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 12,
            children: [
              for (var index = 0; index < keypad.length; index++)
                if (keypad[index].isEmpty)
                  const SizedBox(width: 78, height: 66)
                else
                  _key(palette, keypad[index]),
            ],
          ),
        ),
        if (_unlocking)
          Padding(
            padding: const EdgeInsets.only(top: 22),
            child: CircularProgressIndicator(color: palette.primary),
          ),
        if ((ref.watch(settingsProvider).value?.biometricAvailable ?? false) &&
            !kIsWeb)
          Padding(
            padding: const EdgeInsets.only(top: 22),
            child: GestureDetector(
              onTap: _forgotPin,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  'Forgot PIN? Verify with biometrics to turn off',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _bioPanel(Palette palette) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _mark(palette, Icons.fingerprint),
        const SizedBox(height: 18),
        Text(
          'Your Saving Jar is locked',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.foreground, fontSize: 24),
        ),
        const SizedBox(height: 7),
        Text(
          'Use your fingerprint or face to keep saving.',
          textAlign: TextAlign.center,
          style: TextStyle(color: palette.muted, fontSize: 13),
        ),
        if (_bioError != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(
              _bioError!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.error,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        const SizedBox(height: 22),
        GestureDetector(
          onTap: _unlocking ? null : _promptBio,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 18),
            decoration: BoxDecoration(
              color: hexAlpha(toRrggbb(palette.primary), '14'),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(
                color: hexAlpha(toRrggbb(palette.primary), '44'),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_unlocking)
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(color: palette.primary),
                  )
                else
                  Icon(Icons.fingerprint, size: 20, color: palette.primary),
                const SizedBox(width: 8),
                Text(
                  _unlocking ? 'Checking…' : 'Try again',
                  style: TextStyle(
                    color: palette.primary,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_canPin)
          Padding(
            padding: const EdgeInsets.only(top: 22),
            child: GestureDetector(
              onTap: () => setState(() => _pinShown = true),
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(
                  'Use PIN instead',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.only(top: 22),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 240),
              child: Text(
                'Authentication is unavailable. The lock stays active; restart the app or restore device authentication to continue.',
                textAlign: TextAlign.center,
                style: TextStyle(color: palette.muted, fontSize: 11),
              ),
            ),
          ),
      ],
    );
  }

  Widget _mark(Palette palette, IconData icon) {
    return Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        color: hexAlpha(toRrggbb(palette.primary), '18'),
        borderRadius: BorderRadius.circular(26),
      ),
      child: Icon(icon, size: 30, color: palette.primary),
    );
  }

  Widget _key(Palette palette, String key) {
    final isBack = key == 'back';
    return Semantics(
      button: true,
      label: isBack ? 'Delete' : 'Digit $key',
      child: GestureDetector(
        onTap: isBack ? _erase : () => _handleKey(key),
        child: Container(
          width: 78,
          height: 66,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: palette.border),
          ),
          child: isBack
              ? Icon(Icons.backspace, size: 22, color: palette.muted)
              : Text(
                  key,
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                  ),
                ),
        ),
      ),
    );
  }
}
