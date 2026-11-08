/// The profile's file-backup panel: export a `.jarly` file, pick one back,
/// preview the restore, and commit it.
///
/// Port of `components/backup-panel.tsx` + `components/backup.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/palette.dart';
import '../../domain/domain.dart' show Jar;
import '../../services/backup_io.dart';
import '../../state/providers.dart';
import '../../transfer/backup.dart';
import '../../transfer/merge.dart' show MergeResult;
import '../widgets/pressable.dart';

class BackupPanel extends ConsumerStatefulWidget {
  const BackupPanel({super.key});

  @override
  ConsumerState<BackupPanel> createState() => _BackupPanelState();
}

class _BackupPanelState extends ConsumerState<BackupPanel> {
  Backup? _backup;
  bool _busy = false;
  bool _working = false;
  String? _notice;
  String? _error;

  bool get _disabled =>
      _busy || !(ref.read(savingsProvider).value?.ready ?? false);

  Future<void> _run(Future<void> Function() action) async {
    if (_working) return;
    _working = true;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await action();
    } catch (error) {
      setState(() {
        _error = error is BackupParseException || error is BackupIoException
            ? error.toString()
            : 'Could not complete the backup action. Try again.';
      });
    } finally {
      _working = false;
      if (mounted) setState(() => _busy = false);
    }
  }

  void _restore() {
    final backup = _backup;
    if (backup == null ||
        _disabled ||
        previewBackup(backup, _jars, _currency).error != null) {
      return;
    }
    _run(() async {
      // The store validates again against fresh jars, including changes
      // since the preview was shown.
      final result = ref
          .read(savingsProvider.notifier)
          .importTransfer(backup.frames, _currency);
      if (result.error != null) throw BackupIoException(result.error!);
      setState(() {
        _notice =
            'Restored ${result.added} new and ${result.updated} updated jars; ${result.skipped} unchanged. Existing jars were kept.';
        _backup = null;
      });
    });
  }

  String get _currency => ref.read(settingsProvider).value?.currency ?? 'USD';

  List<Jar> get _jars => ref.read(savingsProvider).value?.jars ?? const [];

  String _majorMinor(String totalMinor) {
    final value = BigInt.parse(totalMinor);
    final major = value ~/ BigInt.from(100);
    final minor = (value % BigInt.from(100)).abs().toString().padLeft(2, '0');
    return '$major.$minor';
  }

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final savings = ref.watch(savingsProvider).value;
    final preview = _backup == null
        ? null
        : previewBackup(_backup!, savings?.jars ?? const [], _currency);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 26, bottom: 9),
          child: Text(
            'FILE BACKUP',
            style: TextStyle(
              color: palette.muted,
              fontSize: 10,
              letterSpacing: 1.1,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(21),
            border: Border.all(color: palette.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Keep a copy of your savings',
                style: TextStyle(
                  color: palette.foreground,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Save a .jarly file with every jar and its history, including completed and archived jars. PINs and app settings are excluded. The file contains readable savings data; keep it somewhere private.',
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 12,
                  height: 18 / 12,
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _panelButton(
                    palette,
                    label: 'Export backup',
                    enabled: !_disabled,
                    primary: false,
                    onTap: () => _run(() async {
                      final currency = _currency;
                      final frames = ref
                          .read(savingsProvider.notifier)
                          .exportTransfer(currency);
                      await saveBackupFile(createBackup(frames));
                      setState(() {
                        _notice = backupSavesViaBrowser
                            ? 'Backup download requested. Check your browser downloads.'
                            : 'Backup share sheet closed. A copy is saved only if you chose a destination.';
                      });
                    }),
                  ),
                  _panelButton(
                    palette,
                    label: 'Choose backup file',
                    enabled: !_disabled,
                    primary: false,
                    onTap: () => _run(() async {
                      setState(() => _backup = null);
                      final text = await pickBackupFile();
                      if (text != null) {
                        setState(() => _backup = parseBackup(text));
                      }
                    }),
                  ),
                ],
              ),
              if (savings?.storageError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    'Backups are unavailable until local storage can be read safely: ${savings!.storageError}',
                    style: TextStyle(
                      color: palette.error,
                      fontSize: 12,
                      height: 18 / 12,
                    ),
                  ),
                ),
              if (_busy)
                const Padding(
                  padding: EdgeInsets.only(top: 10),
                  child: Text('Working…'),
                ),
              if (_backup != null && preview != null)
                _previewBlock(palette, preview),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: palette.error,
                      fontSize: 12,
                      height: 18 / 12,
                    ),
                  ),
                ),
              if (_notice != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(
                    _notice!,
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 12,
                      height: 18 / 12,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _previewBlock(Palette palette, MergeResult preview) {
    final backup = _backup!;
    return Container(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Restore preview',
            style: TextStyle(
              color: palette.foreground,
              fontSize: 14,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Exported ${DateTime.tryParse(backup.snapshot.exportedAt)?.toLocal() ?? backup.snapshot.exportedAt}',
            style: TextStyle(
              color: palette.muted,
              fontSize: 12,
              height: 18 / 12,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${backup.snapshot.currency} · ${backup.summary.jars} jars · ${backup.summary.entries} entries · ${backup.summary.archived} archived',
            style: TextStyle(
              color: palette.muted,
              fontSize: 12,
              height: 18 / 12,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Total including archived: ${backup.snapshot.currency} ${_majorMinor(backup.summary.totalMinor)}',
            style: TextStyle(
              color: palette.muted,
              fontSize: 12,
              height: 18 / 12,
            ),
          ),
          const SizedBox(height: 8),
          if (preview.error != null)
            Text(
              preview.error!,
              style: TextStyle(
                color: palette.error,
                fontSize: 12,
                height: 18 / 12,
              ),
            )
          else
            Text(
              '${preview.added} new · ${preview.updated} updated · ${preview.skipped} unchanged. Your other jars stay on this device.',
              style: TextStyle(
                color: palette.muted,
                fontSize: 12,
                height: 18 / 12,
              ),
            ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _panelButton(
                palette,
                label: 'Restore backup',
                enabled: !_disabled && preview.error == null,
                primary: true,
                onTap: _restore,
              ),
              _panelButton(
                palette,
                label: 'Cancel',
                enabled: !_busy,
                primary: false,
                onTap: () => setState(() => _backup = null),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _panelButton(
    Palette palette, {
    required String label,
    required bool enabled,
    required bool primary,
    required VoidCallback onTap,
  }) {
    return Pressable(
      onTap: enabled ? onTap : () {},
      semantics: label,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: primary ? palette.primary : null,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: primary ? palette.primary : palette.border,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: primary ? const Color(0xFFFFFDF9) : palette.primary,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}
