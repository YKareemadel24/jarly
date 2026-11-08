/// New-jar wizard — filled in during the jar-flows phase; minimal stub for now.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/screen_container.dart';

class NewJarScreen extends ConsumerWidget {
  const NewJarScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    return ScreenContainer(
      child: Center(
        child: Text(
          'New jar',
          style: TextStyle(color: palette.muted, fontSize: 15),
        ),
      ),
    );
  }
}
