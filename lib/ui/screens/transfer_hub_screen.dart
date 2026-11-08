/// The door to moving jars between devices.
///
/// A transfer never touches the network: it is one phone showing codes and
/// another reading them. That is the whole point — it works on a plane, it
/// works when the server is down, and nothing about a personal jar leaves the
/// two devices involved.
///
/// Port of `app/transfer/index.tsx` + `components/transfer-index.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../services/haptics.dart';
import '../../state/providers.dart';
import '../widgets/circle_button.dart';
import '../widgets/pressable.dart';
import '../widgets/screen_container.dart';

class TransferHubScreen extends ConsumerWidget {
  const TransferHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    final savings = ref.watch(savingsProvider).value;
    final jars = savings?.jars ?? const <Jar>[];
    final portable = jars.where((jar) => !jar.isArchived).toList();
    final entries = portable.fold<int>(
      0,
      (sum, jar) => sum + jar.entries.length,
    );

    return ScreenContainer(
      scrollable: true,
      child: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleButton(
                  palette: palette,
                  semantics: 'Go back',
                  icon: Icons.arrow_back,
                  onTap: () => context.pop(),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              'MOVE YOUR JARS',
              style: TextStyle(
                color: palette.muted,
                fontSize: 10,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Bring it\nwith you.',
              style: TextStyle(
                color: palette.foreground,
                fontSize: 31,
                height: 36 / 31,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              'Move your jars straight from one phone to another. Nothing is uploaded, and both devices can be offline.',
              style: TextStyle(
                color: palette.muted,
                fontSize: 13.5,
                height: 20 / 13.5,
              ),
            ),
            const SizedBox(height: 20),

            // Summary
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: hexAlpha(accentFor('ocean', palette), '12'),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: hexAlpha(accentFor('ocean', palette), '33'),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      children: [
                        Text(
                          '${portable.length}',
                          style: TextStyle(
                            color: palette.foreground,
                            fontSize: 24,
                            fontFamily: 'Georgia',
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${portable.length == 1 ? 'jar' : 'jars'} ready to move',
                          style: TextStyle(
                            color: palette.muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(width: 0.5, color: palette.border, height: 44),
                  Expanded(
                    child: Column(
                      children: [
                        Text(
                          '$entries',
                          style: TextStyle(
                            color: palette.foreground,
                            fontSize: 24,
                            fontFamily: 'Georgia',
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${entries == 1 ? 'entry' : 'entries'} of history',
                          style: TextStyle(
                            color: palette.muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Send
            Pressable(
              onTap: () {
                Haptics.tap();
                context.push('/transfer/send');
              },
              semantics: 'Send from this device',
              child: _choiceCard(
                palette,
                iconBackground: hexAlpha(accentFor('mint', palette), '1F'),
                icon: Icons.qr_code_2,
                iconColor: parseHex(accentFor('mint', palette)),
                title: 'Send from this device',
                copy: 'Show codes on this screen for the other phone to read.',
              ),
            ),
            const SizedBox(height: 14),

            // Receive
            Pressable(
              onTap: () {
                Haptics.tap();
                context.push('/transfer/receive');
              },
              semantics: 'Receive on this device',
              child: _choiceCard(
                palette,
                iconBackground: hexAlpha(accentFor('amber', palette), '1F'),
                icon: Icons.move_to_inbox,
                iconColor: parseHex(accentFor('amber', palette)),
                title: 'Receive on this device',
                copy: 'Bring jars in from another phone.',
              ),
            ),
            const SizedBox(height: 22),

            // Note
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 16, color: palette.muted),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Jars you share with other people are not copied — they already live on your device.',
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 11.5,
                      height: 17 / 11.5,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _choiceCard(
    Palette palette, {
    required Color iconBackground,
    required IconData icon,
    required Color iconColor,
    required String title,
    required String copy,
  }) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(21),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: iconBackground,
              borderRadius: BorderRadius.circular(15),
            ),
            child: Icon(icon, size: 22, color: iconColor),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  copy,
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 11.5,
                    height: 16 / 11.5,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right, size: 22, color: palette.muted),
        ],
      ),
    );
  }
}
