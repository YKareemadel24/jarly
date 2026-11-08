/// Jar detail — filled in during the jar-flows phase; minimal stub for now so
/// navigation resolves.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/screen_container.dart';

class JarDetailScreen extends ConsumerWidget {
  const JarDetailScreen({super.key, required this.jarId, this.autoDeposit = false});

  final String jarId;
  final bool autoDeposit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    return ScreenContainer(
      child: Center(
        child: Text(
          'Jar $jarId',
          style: TextStyle(color: palette.muted, fontSize: 15),
        ),
      ),
    );
  }
}
