/// Minimal stand-in for screens ported in later phases. Never shipped as a
/// final destination — each is replaced as its phase lands.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/screen_container.dart';

class PlaceholderScreen extends ConsumerWidget {
  const PlaceholderScreen({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    return ScreenContainer(
      child: Center(
        child: Text(
          title,
          style: TextStyle(color: palette.muted, fontSize: 15),
        ),
      ),
    );
  }
}
