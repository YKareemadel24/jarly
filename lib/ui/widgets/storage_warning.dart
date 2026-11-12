/// Persistent alert banner for local storage errors.
///
/// Port of `components/storage-warning.tsx`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';

class StorageWarning extends ConsumerWidget {
  const StorageWarning({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final savingsError = ref.watch(savingsProvider).value?.storageError;
    final settingsError = ref.watch(settingsProvider).value?.storageError;
    final errors = [?savingsError, ?settingsError];
    if (errors.isEmpty) return const SizedBox.shrink();
    return Positioned(
      top: 54,
      left: 16,
      right: 16,
      child: Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFF8B2F27),
            borderRadius: BorderRadius.circular(12),
            boxShadow: const [
              BoxShadow(
                color: Color(0x33000000),
                blurRadius: 12,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: Text(
            errors.join('\n'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}
