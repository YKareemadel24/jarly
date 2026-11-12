/// The RN `Pressable` feel, shared across screens: opacity + scale while
/// pressed, optional long press with a custom delay, tap suppressed once the
/// long press fires.
library;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'sheet_scaffold.dart';

class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    required this.onTap,
    this.onLongPress,
    this.longPressDelay = const Duration(milliseconds: 320),
    this.semantics,
    this.enabled = true,
  });

  final Widget child;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final Duration longPressDelay;
  final String? semantics;
  final bool enabled;

  @override
  State<Pressable> createState() => PressableState();
}

class PressableState extends State<Pressable> {
  bool _pressed = false;
  bool _longFired = false;
  bool _showFocus = false;

  @override
  Widget build(BuildContext context) {
    // Hidden sheets retain their children during the exit animation.
    final enabled =
        widget.enabled &&
        context.findAncestorWidgetOfExactType<SheetScaffold>()?.visible !=
            false;
    final content = Semantics(
      button: true,
      enabled: enabled,
      label: widget.semantics,
      excludeSemantics: widget.semantics != null,
      onTap: enabled ? widget.onTap : null,
      onLongPress: enabled ? widget.onLongPress : null,
      child: RawGestureDetector(
        excludeFromSemantics: true,
        gestures: {
          if (enabled && widget.onLongPress != null)
            LongPressGestureRecognizer:
                GestureRecognizerFactoryWithHandlers<
                  LongPressGestureRecognizer
                >(
                  () => LongPressGestureRecognizer(
                    duration: widget.longPressDelay,
                  ),
                  (instance) => instance.onLongPress = () {
                    setState(() => _longFired = true);
                    widget.onLongPress!();
                  },
                ),
        },
        child: GestureDetector(
          excludeFromSemantics: true,
          onTap: enabled && !_longFired ? widget.onTap : null,
          onTapDown: !enabled
              ? null
              : (_) {
                  _longFired = false;
                  setState(() => _pressed = true);
                },
          onTapUp: !enabled ? null : (_) => setState(() => _pressed = false),
          onTapCancel: !enabled ? null : () => setState(() => _pressed = false),
          behavior: HitTestBehavior.opaque,
          child: AnimatedScale(
            scale: _pressed ? 0.98 : 1,
            duration: const Duration(milliseconds: 100),
            child: AnimatedOpacity(
              opacity: _pressed ? 0.86 : 1,
              duration: const Duration(milliseconds: 100),
              child: DecoratedBox(
                position: DecorationPosition.foreground,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: _showFocus && enabled
                      ? Border.all(
                          color: Theme.of(context).colorScheme.onSurface,
                          width: 2,
                        )
                      : null,
                ),
                child: widget.child,
              ),
            ),
          ),
        ),
      ),
    );
    return FocusableActionDetector(
      enabled: enabled,
      onShowFocusHighlight: (show) => setState(() => _showFocus = show),
      shortcuts: const {
        SingleActivator(LogicalKeyboardKey.enter, includeRepeats: false):
            ActivateIntent(),
        SingleActivator(LogicalKeyboardKey.numpadEnter, includeRepeats: false):
            ActivateIntent(),
        SingleActivator(LogicalKeyboardKey.space, includeRepeats: false):
            ActivateIntent(),
      },
      actions: {
        ActivateIntent: CallbackAction<ActivateIntent>(
          onInvoke: (_) {
            if (enabled) widget.onTap();
            return null;
          },
        ),
      },
      child: content,
    );
  }
}
