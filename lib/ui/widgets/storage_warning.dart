/// Persistent alert banner shown when local storage cannot be read safely.
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
    final storageError = ref.watch(savingsProvider).value?.storageError;
    if (storageError == null) return const SizedBox.shrink();
    return Semantics(
      liveRegion: true,
      child: Positioned(
        top: 54,
        left: 16,
        right: 16,
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
            storageError,
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
