/// Lightweight bottom toast for calm, reversible actions, port of
/// `components/toast.tsx`. Announces politely to screen readers and
/// auto-dismisses.
library;

import 'package:flutter/material.dart';

import '../../core/theme/palette.dart';
import 'pressable.dart';

class AppToast extends StatefulWidget {
  const AppToast({
    super.key,
    required this.visible,
    required this.message,
    this.actionLabel,
    this.onAction,
    required this.onDismiss,
    this.durationMs = 5500,
  });

  final bool visible;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final VoidCallback onDismiss;

  /// Auto-dismiss delay in ms; 0 disables.
  final int durationMs;

  @override
  State<AppToast> createState() => _AppToastState();
}

class _AppToastState extends State<AppToast> {
  bool _dismissed = false;

  @override
  void didUpdateWidget(AppToast oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.visible && !oldWidget.visible) {
      _dismissed = false;
      if (widget.durationMs > 0) {
        Future.delayed(Duration(milliseconds: widget.durationMs), () {
          if (mounted && widget.visible && !_dismissed) {
            _dismissed = true;
            widget.onDismiss();
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = Palette.of(Theme.brightnessOf(context));
    if (!widget.visible) return const SizedBox.shrink();
    return Positioned(
      left: 20,
      right: 20,
      bottom: 24,
      child: Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          constraints: const BoxConstraints(minHeight: 52),
          decoration: BoxDecoration(
            color: palette.foreground,
            borderRadius: BorderRadius.circular(17),
            boxShadow: const [
              BoxShadow(
                color: Color(0x47201B18),
                blurRadius: 14,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  widget.message,
                  maxLines: 2,
                  style: TextStyle(
                    color: palette.background,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    height: 18 / 13,
                  ),
                ),
              ),
              if (widget.actionLabel != null && widget.onAction != null)
                Pressable(
                  onTap: () {
                    _dismissed = true;
                    widget.onAction!();
                    widget.onDismiss();
                  },
                  semantics: widget.actionLabel,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 7,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.undo,
                          size: 15,
                          color: Color(0xFFFFFDF9),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          widget.actionLabel!,
                          style: const TextStyle(
                            color: Color(0xFFFFFDF9),
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
