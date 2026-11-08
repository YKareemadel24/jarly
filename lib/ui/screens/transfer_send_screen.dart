/// Showing a transfer to another device.
///
/// One code per screen, with the receiver free to read them in any order:
/// every frame carries its own index and the total, so a missed scan is a
/// retry of one code rather than a restart. The codes contain every jar's full
/// history, so the screen is explicit that this is the moment to be sure who
/// is looking.
///
/// Port of `app/transfer/send.tsx` + `components/transfer-send.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../services/haptics.dart';
import '../../state/providers.dart';
import '../widgets/circle_button.dart';
import '../widgets/pressable.dart';
import '../widgets/qr_code.dart';
import '../widgets/screen_container.dart';

class TransferSendScreen extends ConsumerStatefulWidget {
  const TransferSendScreen({super.key});

  @override
  ConsumerState<TransferSendScreen> createState() =>
      _TransferSendScreenState();
}

class _TransferSendScreenState extends ConsumerState<TransferSendScreen> {
  List<String> _frames = const [];
  int _index = 0;

  @override
  void initState() {
    super.initState();
    // Built once per mount: re-encoding on every render would produce a new
    // transfer id and invalidate codes the receiver has already scanned.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final currency =
          ref.read(settingsProvider).value?.currency;
      final frames = ref.read(savingsProvider.notifier).exportTransfer(currency);
      if (mounted) setState(() => _frames = frames);
    });
  }

  void _step(int delta) {
    Haptics.tap();
    setState(() {
      _index = (_index + delta).clamp(0, _frames.length - 1);
    });
  }

  Future<void> _shareText() async {
    Haptics.tap();
    try {
      await SharePlus.instance.share(ShareParams(text: _frames.join('\n')));
    } catch (_) {
      // Dismissing the share sheet is not a failure.
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final savings = ref.watch(savingsProvider).value;
    final jars = savings?.jars ?? const <Jar>[];
    final portable = jars.where((jar) => !jar.isArchived).toList();

    final current = _frames.isNotEmpty ? _frames[_index] : '';
    final multiple = _frames.length > 1;

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
                const Spacer(),
                if (multiple)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: hexAlpha(toRrggbb(palette.primary), '18'),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text('${_index + 1} of ${_frames.length}',
                        style: TextStyle(
                            color: palette.primary,
                            fontSize: 12,
                            fontWeight: FontWeight.w800)),
                  ),
              ],
            ),
            const SizedBox(height: 18),
            Text('Show this to the other phone.',
                style: TextStyle(
                    color: palette.foreground,
                    fontSize: 24,
                    height: 30 / 24)),
            const SizedBox(height: 8),
            Text(
              portable.isEmpty
                  ? 'You have no jars on this device to move yet.'
                  : '${portable.length} ${portable.length == 1 ? 'jar' : 'jars'} and their full history. The other phone reads it with its camera.',
              style: TextStyle(
                  color: palette.muted, fontSize: 13, height: 19 / 13),
            ),
            const SizedBox(height: 20),

            Center(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFDF9),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: palette.border),
                ),
                child: QrCodeView(value: current, size: 264),
              ),
            ),

            if (multiple) ...[
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _PageButton(
                    palette: palette,
                    semantics: 'Previous code',
                    icon: Icons.chevron_left,
                    enabled: _index > 0,
                    onTap: () => _step(-1),
                  ),
                  const SizedBox(width: 14),
                  Flexible(
                    child: Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 5,
                      runSpacing: 5,
                      children: [
                        for (var dot = 0; dot < _frames.length; dot++)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            width: dot == _index ? 16 : 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: dot == _index
                                  ? palette.primary
                                  : palette.border,
                              borderRadius: BorderRadius.circular(99),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  _PageButton(
                    palette: palette,
                    semantics: 'Next code',
                    icon: Icons.chevron_right,
                    enabled: _index < _frames.length - 1,
                    onTap: () => _step(1),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'The other phone can read these in any order. Keep tapping through until every code has been scanned.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: palette.muted,
                    fontSize: 11.5,
                    height: 17 / 11.5),
              ),
            ],

            const SizedBox(height: 18),
            Pressable(
              onTap: _shareText,
              semantics: 'Send the codes as text instead',
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(color: palette.border),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.content_copy,
                        size: 17, color: palette.foreground),
                    const SizedBox(width: 7),
                    Text('Send the codes as text instead',
                        style: TextStyle(
                            color: palette.foreground,
                            fontSize: 13,
                            fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.visibility,
                    size: 16, color: parseHex(accentFor('coral', palette))),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'These codes carry your jars and their history. Only show them to a device you trust.',
                    style: TextStyle(
                        color: parseHex(accentFor('coral', palette)),
                        fontSize: 11.5,
                        height: 17 / 11.5,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PageButton extends StatelessWidget {
  const _PageButton({
    required this.palette,
    required this.icon,
    required this.enabled,
    required this.onTap,
    required this.semantics,
  });

  final Palette palette;
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;
  final String semantics;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantics,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: AnimatedOpacity(
          opacity: enabled ? 1 : 0.35,
          duration: const Duration(milliseconds: 120),
          child: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: palette.surface,
              border: Border.all(color: palette.border),
            ),
            child: Icon(icon, size: 22, color: palette.foreground),
          ),
        ),
      ),
    );
  }
}
