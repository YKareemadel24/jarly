/// Transfer hub — filled in during the transfer phase; minimal stub for now.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../widgets/screen_container.dart';

class TransferHubScreen extends ConsumerWidget {
  const TransferHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    return ScreenContainer(
      child: Center(
        child: Text(
          'Move to another device',
          style: TextStyle(color: palette.muted, fontSize: 15),
        ),
      ),
    );
  }
}
