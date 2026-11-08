/// Safe-area + background wrapper used by every screen.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';

class ScreenContainer extends ConsumerWidget {
  const ScreenContainer({
    super.key,
    required this.child,
    this.horizontal = true,
    this.scrollable = false,
  });

  final Widget child;

  /// Whether the 20px horizontal gutter applies (off for edge-to-edge lists).
  final bool horizontal;
  final bool scrollable;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    return Container(
      color: palette.background,
      child: SafeArea(
        top: true,
        bottom: false,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: horizontal ? 20 : 0),
          child: child,
        ),
      ),
    );
  }
}
