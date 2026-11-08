/// Bottom tab bar: 4 tabs, warm background, 11px/700 labels — ported from
/// `app/(tabs)/_layout.tsx`.
library;

import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/palette.dart';
import '../../state/providers.dart';

class TabShell extends ConsumerWidget {
  const TabShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    final bottomPadding = kIsWeb
        ? 10.0
        : math.max(MediaQuery.paddingOf(context).bottom, 8.0);

    return Scaffold(
      body: shell,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: palette.background,
          border: Border(top: BorderSide(color: palette.border, width: 1)),
        ),
        padding: EdgeInsets.only(bottom: bottomPadding),
        height: 60 + bottomPadding,
        child: Row(
          children: [
            _tab(context, palette, 0, Icons.home_filled, 23, 'Home'),
            _tab(context, palette, 1, Icons.receipt_long, 22, 'Activity'),
            _tab(context, palette, 2, Icons.query_stats, 24, 'Insights'),
            _tab(context, palette, 3, Icons.person_outline, 25, 'Profile'),
          ],
        ),
      ),
    );
  }

  Expanded _tab(
    BuildContext context,
    Palette palette,
    int index,
    IconData icon,
    double size,
    String label,
  ) {
    final selected = shell.currentIndex == index;
    final color = selected ? palette.primary : palette.muted;
    return Expanded(
      child: InkWell(
        onTap: () =>
            shell.goBranch(index, initialLocation: index == shell.currentIndex),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: size, color: color),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                fontFamily: null,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
