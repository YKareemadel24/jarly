/// Full-screen modal overlay hosting bottom sheets and centered cards.
///
/// Extracted from the jar detail port so every screen renders its sheets with
/// the same backdrop, animation, and keyboard handling.
library;

import 'package:flutter/material.dart';

import '../../core/theme/palette.dart';

class SheetScaffold extends StatelessWidget {
  const SheetScaffold({
    super.key,
    required this.visible,
    required this.onDismiss,
    required this.palette,
    required this.child,
    this.centerCard = false,
  });

  final bool visible;
  final VoidCallback onDismiss;
  final Palette palette;
  final Widget child;

  /// Centered card (alert-style sheets) instead of a bottom sheet.
  final bool centerCard;

  @override
  Widget build(BuildContext context) {
    final content = Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: child,
    );

    final card = centerCard
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: Material(
                  color: palette.surface,
                  borderRadius: BorderRadius.circular(24),
                  clipBehavior: Clip.antiAlias,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: child,
                  ),
                ),
              ),
            ),
          )
        : Align(
            alignment: Alignment.bottomCenter,
            child: Material(
              color: palette.background,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(30),
              ),
              clipBehavior: Clip.antiAlias,
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(context).height * 0.88,
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(23, 18, 23, 32),
                  child: content,
                ),
              ),
            ),
          );

    return Positioned.fill(
      child: IgnorePointer(
        ignoring: !visible,
        child: AnimatedOpacity(
          opacity: visible ? 1 : 0,
          duration: const Duration(milliseconds: 220),
          child: Stack(
            children: [
              Positioned.fill(
                child: ColoredBox(
                  color: centerCard
                      ? const Color(0x781C1612)
                      : const Color(0x7A201B18),
                  child: GestureDetector(
                    onTap: onDismiss,
                    behavior: HitTestBehavior.opaque,
                  ),
                ),
              ),
              Positioned.fill(
                child: AnimatedSlide(
                  offset: visible ? Offset.zero : const Offset(0, 0.4),
                  duration: const Duration(milliseconds: 240),
                  curve: Curves.easeOutCubic,
                  child: SafeArea(child: card),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
