/// The RN `Pressable` feel, shared across screens: opacity + scale while
/// pressed, optional long press with a custom delay, tap suppressed once the
/// long press fires.
library;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.child,
    required this.onTap,
    this.onLongPress,
    this.longPressDelay = const Duration(milliseconds: 320),
    this.semantics,
  });

  final Widget child;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final Duration longPressDelay;
  final String? semantics;

  @override
  State<Pressable> createState() => PressableState();
}

class PressableState extends State<Pressable> {
  bool _pressed = false;
  bool _longFired = false;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.semantics,
      child: RawGestureDetector(
        gestures: {
          if (widget.onLongPress != null)
            LongPressGestureRecognizer:
                GestureRecognizerFactoryWithHandlers<
                    LongPressGestureRecognizer>(
              () => LongPressGestureRecognizer(duration: widget.longPressDelay),
              (instance) => instance.onLongPress = () {
                setState(() => _longFired = true);
                widget.onLongPress!();
              },
            ),
        },
        child: GestureDetector(
          onTap: _longFired ? null : widget.onTap,
          onTapDown: (_) {
            _longFired = false;
            setState(() => _pressed = true);
          },
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          behavior: HitTestBehavior.opaque,
          child: AnimatedScale(
            scale: _pressed ? 0.98 : 1,
            duration: const Duration(milliseconds: 100),
            child: AnimatedOpacity(
              opacity: _pressed ? 0.86 : 1,
              duration: const Duration(milliseconds: 100),
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }
}
