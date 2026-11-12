/// Bringing jars onto this device.
///
/// The frames arrive one at a time, in whatever order the sender managed to
/// show them, and the screen reports exactly which ones are still missing.
/// Nothing is written until the whole transfer decodes, so a half-finished
/// scan can never leave a partially-imported jar list behind.
///
/// Frames are collected as text rather than through a camera: this build has
/// no camera module, and a paste field is honest about that. The collection
/// and decoding logic is camera-agnostic — a scanner only has to call
/// [TransferReceiveScreenState.accept] with each frame it reads.
///
/// Port of `app/transfer/receive.tsx` + `components/transfer-receive.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../services/haptics.dart';
import '../../state/providers.dart';
import '../../state/savings_controller.dart' show ImportResult, StoreException;
import '../../transfer/transfer.dart';
import '../widgets/app_toast.dart';
import '../widgets/circle_button.dart';
import '../widgets/screen_container.dart';

class TransferReceiveScreen extends ConsumerStatefulWidget {
  const TransferReceiveScreen({super.key});

  @override
  ConsumerState<TransferReceiveScreen> createState() =>
      TransferReceiveScreenState();
}

class TransferReceiveScreenState extends ConsumerState<TransferReceiveScreen> {
  final List<String> _frames = [];
  final TextEditingController _draft = TextEditingController();
  bool _done = false;
  bool _saving = false;
  ImportResult? _result;
  String? _error;
  String? _toast;

  @override
  void initState() {
    super.initState();
    _draft.addListener(() {
      if (_error != null) setState(() => _error = null);
    });
  }

  @override
  void dispose() {
    _draft.dispose();
    super.dispose();
  }

  /// Add one frame. Returns false when it is not a frame this app understands.
  bool accept(String raw) {
    final text = raw.trim();
    if (text.length > maxTransferFrameLength ||
        !text.startsWith('$transferPrefix.')) {
      return false;
    }
    setState(() {
      if (_frames.contains(text)) return;
      if (_frames.length < maxTransferFrames) _frames.add(text);
    });
    return true;
  }

  void _addDraft() {
    final lines = _draft.text
        .split(RegExp(r'\s+'))
        .where((line) => line.isNotEmpty);
    var accepted = 0;
    for (final line in lines) {
      if (accept(line)) accepted += 1;
    }
    if (accepted == 0) {
      Haptics.error();
      setState(
        () => _error =
            'That is not a Saving Jar code. Check you copied the whole line.',
      );
      return;
    }
    Haptics.tap();
    setState(() {
      _draft.clear();
      _error = null;
      _toast = accepted == 1 ? 'Code added.' : '$accepted codes added.';
    });
  }

  Future<void> _finish() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final currency = ref.read(settingsProvider).value?.currency;
      final outcome = await ref
          .read(savingsProvider.notifier)
          .importTransfer(List.of(_frames), currency);
      if (!mounted) return;
      if (outcome.error != null) {
        Haptics.error();
        setState(() => _error = outcome.error);
        return;
      }
      Haptics.success();
      setState(() {
        _result = outcome;
        _done = true;
      });
    } on StoreException catch (caught) {
      if (mounted) setState(() => _error = caught.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _reset() {
    setState(() {
      _frames.clear();
      _draft.clear();
      _result = null;
      _error = null;
      _done = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final assembly = decodeTransferFrames(List.of(_frames));
    final complete = assembly?.snapshot != null;

    if (_done && _result != null) {
      return ScreenContainer(child: _doneBody(palette));
    }

    final screen = ScreenContainer(
      scrollable: true,
      child: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.only(top: 18, bottom: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CircleButton(
                  palette: palette,
                  semantics: 'Go back',
                  icon: Icons.arrow_back,
                  onTap: () => context.pop(),
                ),
                const SizedBox(height: 18),
                Text(
                  'RECEIVE',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 10,
                    letterSpacing: 1.4,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Add the codes\nfrom the other phone.',
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 29,
                    height: 35 / 29,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Paste each code the other phone shows. They can go in any order, and adding one twice does nothing.',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 13.5,
                    height: 20 / 13.5,
                  ),
                ),

                if (assembly != null && assembly.total > 0) ...[
                  const SizedBox(height: 20),
                  _progressCard(palette, assembly, complete),
                ],

                const SizedBox(height: 18),
                TextField(
                  controller: _draft,
                  minLines: 4,
                  maxLines: 8,
                  autocorrect: false,
                  enableSuggestions: false,
                  style: TextStyle(color: palette.foreground, fontSize: 12),
                  decoration: InputDecoration(
                    hintText: 'Paste a code starting with $transferPrefix.',
                    hintStyle: TextStyle(color: palette.muted, fontSize: 12),
                    filled: true,
                    fillColor: palette.surface,
                    contentPadding: const EdgeInsets.all(14),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: BorderSide(color: palette.border),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: BorderSide(color: palette.border),
                    ),
                  ),
                ),

                const SizedBox(height: 12),
                _PrimaryButton(
                  label: 'Add this code',
                  icon: Icons.add,
                  enabled: _draft.text.trim().isNotEmpty,
                  onTap: _addDraft,
                  palette: palette,
                ),

                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      _error!,
                      style: TextStyle(
                        color: palette.error,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),

                const SizedBox(height: 20),
                if (_saving) const Text('Saving…'),
                _FinishButton(
                  enabled: complete && !_saving,
                  jarCount: assembly?.snapshot?.jars.length ?? 0,
                  onTap: complete ? _finish : null,
                  palette: palette,
                ),

                const SizedBox(height: 22),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.lock_outline, size: 16, color: palette.muted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Nothing is written to this device until every code has arrived, so a half-finished transfer leaves your jars exactly as they were.',
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

          AppToast(
            visible: _toast != null,
            message: _toast ?? '',
            onDismiss: () => setState(() => _toast = null),
          ),
        ],
      ),
    );
    return AbsorbPointer(absorbing: _saving, child: screen);
  }

  Widget _doneBody(Palette palette) {
    final result = _result!;
    final mint = accentFor('mint', palette);
    final parts = <String>[
      if (result.added > 0)
        '${result.added} ${result.added == 1 ? 'jar' : 'jars'} added. ',
      if (result.updated > 0)
        '${result.updated} updated from a fuller history. ',
      if (result.added == 0 && result.updated == 0)
        'Everything was already on this device. ',
      if (result.skipped > 0)
        '${result.skipped} left alone because this device already had more.',
    ];
    return Center(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 66,
              height: 66,
              decoration: BoxDecoration(
                color: hexAlpha(mint, '1F'),
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(Icons.check_circle, size: 30, color: parseHex(mint)),
            ),
            const SizedBox(height: 18),
            Text(
              'They are here.',
              style: TextStyle(color: palette.foreground, fontSize: 24),
            ),
            const SizedBox(height: 8),
            Text(
              parts.join(),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: palette.muted,
                fontSize: 13,
                height: 19 / 13,
              ),
            ),
            const SizedBox(height: 24),
            PressablePrimary(
              label: 'See my jars',
              onTap: () => context.go('/'),
              palette: palette,
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: _reset,
              behavior: HitTestBehavior.opaque,
              child: Container(
                constraints: const BoxConstraints(minHeight: 46),
                alignment: Alignment.center,
                child: Text(
                  'Bring in more',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _progressCard(
    Palette palette,
    TransferAssembly assembly,
    bool complete,
  ) {
    final mint = accentFor('mint', palette);
    final missing = assembly.missing;
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: complete ? hexAlpha(mint, '12') : palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: complete ? parseHex(mint) : palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  complete ? 'ALL CODES IN' : 'COLLECTING',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 10,
                    letterSpacing: 1.1,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Text(
                '${assembly.have.length} of ${assembly.total}',
                style: TextStyle(
                  color: complete ? parseHex(mint) : palette.foreground,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 11),
          Container(
            height: 6,
            decoration: BoxDecoration(
              color: palette.border,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: assembly.have.length / assembly.total,
                child: Container(
                  decoration: BoxDecoration(
                    color: complete ? parseHex(mint) : palette.primary,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
            ),
          ),
          if (!complete && missing.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                'Still need ${missing.take(8).join(', ')}${missing.length > 8 ? ' and ${missing.length - 8} more' : ''}.',
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 11.5,
                  height: 16 / 11.5,
                ),
              ),
            ),
          if (assembly.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                assembly.error!,
                style: TextStyle(
                  color: palette.error,
                  fontSize: 11.5,
                  height: 16 / 11.5,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Filled primary action row, matching the RN `styles.primary` pattern.
class PressablePrimary extends StatelessWidget {
  const PressablePrimary({
    super.key,
    required this.label,
    required this.onTap,
    required this.palette,
  });

  final String label;
  final VoidCallback onTap;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 50),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: palette.primary,
          borderRadius: BorderRadius.circular(15),
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: Color(0xFFFFFDF9),
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.label,
    required this.icon,
    required this.enabled,
    required this.onTap,
    required this.palette,
  });

  final String label;
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: AnimatedOpacity(
        opacity: enabled ? 1 : 0.5,
        duration: const Duration(milliseconds: 120),
        child: Container(
          constraints: const BoxConstraints(minHeight: 50),
          decoration: BoxDecoration(
            color: palette.primary,
            borderRadius: BorderRadius.circular(15),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.add, size: 19, color: Color(0xFFFFFDF9)),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: Color(0xFFFFFDF9),
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FinishButton extends StatelessWidget {
  const _FinishButton({
    required this.enabled,
    required this.jarCount,
    required this.onTap,
    required this.palette,
  });

  final bool enabled;
  final int jarCount;
  final VoidCallback? onTap;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final mint = accentFor('mint', palette);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: enabled ? parseHex(mint) : palette.surface,
          borderRadius: BorderRadius.circular(16),
          border: enabled ? null : Border.all(color: palette.border),
        ),
        child: Text(
          enabled
              ? 'Bring in $jarCount ${jarCount == 1 ? 'jar' : 'jars'}'
              : 'Add every code to continue',
          style: TextStyle(
            color: enabled ? const Color(0xFFFFFDF9) : palette.muted,
            fontSize: 14.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}
