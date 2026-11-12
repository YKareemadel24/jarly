/// Jar detail: hero vessel with coin-drop, stat row, deposit/withdraw sheet,
/// habit streak, recurring schedule, savings plan, personal reminders, and the
/// correction/undo-capable transaction list.
///
/// Port of `app/jar/[id].tsx` with the sheets from `components/*.tsx`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../data/settings_repository.dart' show supportedCurrencies;
import '../../services/haptics.dart';
import '../../state/providers.dart';
import '../../state/savings_controller.dart';
import '../widgets/action_sheet.dart';
import '../widgets/app_toast.dart';
import '../widgets/jar_reminder_settings.dart';
import '../widgets/jar_vessel.dart';
import '../widgets/pressable.dart';
import '../widgets/savings_plan_card.dart';
import '../widgets/screen_container.dart';
import '../widgets/sheet_scaffold.dart';

class JarDetailScreen extends ConsumerStatefulWidget {
  const JarDetailScreen({
    super.key,
    required this.jarId,
    this.autoDeposit = false,
  });

  final String jarId;
  final bool autoDeposit;

  @override
  ConsumerState<JarDetailScreen> createState() => _JarDetailScreenState();
}

class _JarDetailScreenState extends ConsumerState<JarDetailScreen> {
  String? direction; // "deposit" | "withdrawal" | null
  String amount = '';
  String note = '';
  String error = '';
  ({int level, int progress})? celebration;
  bool recurringVisible = false;
  String recurringAmount = '';
  String cadence = 'weekly';
  bool editVisible = false;
  String editName = '';
  String editTarget = '';
  String editDeadline = '';
  String? editingEntryId;
  String? notice;
  int coinKey = 0;
  bool menuVisible = false;
  ({String jarId, String name, int amount, String entryId, String direction})?
  undo;
  bool _actionConsumed = false;
  bool _saving = false;
  int _transactionSession = 0;
  FocusNode? _transactionOrigin;

  void _clearTransactionDraft() {
    final origin = _transactionOrigin;
    _transactionOrigin = null;
    if (origin != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            direction == null &&
            origin.context?.mounted == true &&
            origin.canRequestFocus) {
          origin.requestFocus();
        }
      });
    }
    direction = null;
    amount = '';
    note = '';
    error = '';
  }

  void _openTransaction(String chosen) {
    if (_saving || direction != null) return;
    setState(() {
      _clearTransactionDraft();
      _transactionOrigin = FocusManager.instance.primaryFocus;
      direction = chosen;
      _transactionSession++;
    });
  }

  void _openRecurring(RecurringRule? rule) {
    setState(() {
      recurringAmount = rule == null ? '' : minorToDecimal(rule.amount);
      cadence = rule != null && cadences.contains(rule.cadence)
          ? rule.cadence
          : 'weekly';
      error = '';
      recurringVisible = true;
    });
  }

  Future<void> _save(Future<void> Function() action) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      error = '';
      notice = null;
    });
    try {
      await action();
    } on StoreException catch (caught) {
      if (!mounted) return;
      setState(() {
        error = caught.message;
        if (direction == null && !recurringVisible && !editVisible) {
          notice = caught.message;
        }
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.autoDeposit) {
      // Deep-link action auto-opens the deposit sheet once per mount only.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_actionConsumed) {
          _actionConsumed = true;
          _openTransaction(directionDeposit);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final savings = ref.watch(savingsProvider).value ?? SavingsState.initial;
    final settings = ref.watch(settingsProvider).value;
    final currency = settings?.currency ?? 'USD';
    final jar = savings.jars
        .where((item) => item.id == widget.jarId)
        .firstOrNull;
    final palette = ref.watch(paletteProvider);
    final format = ref.watch(moneyFormatterProvider);

    if (jar == null) {
      return ScreenContainer(
        child: Center(
          child: Text(
            'This jar is no longer available.',
            style: TextStyle(color: palette.muted),
          ),
        ),
      );
    }

    final accent = accentFor(jar.accent, palette);
    final progress = percent(jar);
    final remaining = jar.target - jar.balance > 0
        ? jar.target - jar.balance
        : 0;
    final editingEntry = jar.entries
        .where((entry) => entry.id == editingEntryId)
        .firstOrNull;
    final amountMinor = parseAmountInput(amount);
    final withdrawPreview =
        direction == directionWithdrawal && amountMinor != null
        ? max64(jar.balance - amountMinor)
        : null;
    final depositPreview = direction == directionDeposit && amountMinor != null
        ? jar.balance + amountMinor
        : null;
    final depositPreviewPct = depositPreview != null
        ? percent(jar.copyWith(balance: depositPreview))
        : null;
    final presets = quickPresets(jar, DateTime.now(), currency);
    final currencySymbol =
        supportedCurrencies
            .where((c) => c.code == currency)
            .firstOrNull
            ?.symbol ??
        r'$';

    final chosen = direction;
    final session = _transactionSession;
    final draftNote = note.trim();

    Future<void> record() async {
      if (!mounted ||
          _saving ||
          chosen == null ||
          direction != chosen ||
          session != _transactionSession) {
        return;
      }
      final value = amountMinor;
      if (value == null) {
        Haptics.error();
        setState(() => error = amountInputHelp);
        return;
      }
      if (chosen == directionWithdrawal && value > jar.balance) {
        Haptics.error();
        setState(
          () => error =
              'You can withdraw up to ${format(jar.balance)} from this jar.',
        );
        return;
      }
      await _save(() async {
        final controller = ref.read(savingsProvider.notifier);
        final result = await controller.addEntry(
          jar.id,
          value,
          chosen,
          note: draftNote.isEmpty ? null : draftNote,
        );
        if (!mounted) return;
        if (result == null) {
          Haptics.error();
          setState(
            () => error = 'The transaction could not be saved. Check the amount and available balance.',
          );
          return;
        }
        final reached = result.reached;
        if (reached != null) {
          Haptics.milestone();
        } else if (chosen == directionWithdrawal) {
          Haptics.medium();
        } else {
          Haptics.success();
        }
        setState(() {
          _clearTransactionDraft();
          undo = (
            jarId: jar.id,
            name: jar.name,
            amount: value,
            entryId: result.id,
            direction: chosen,
          );
          if (chosen == directionDeposit) coinKey += 1;
          // Snapshot the progress at celebration time so the overlay stays
          // truthful even if the jar changes underneath it.
          if (reached != null) {
            celebration = (
              level: reached,
              progress: percent(jar.copyWith(balance: jar.balance + value)),
            );
          }
        });
      });
    }

    Future<void> performUndo() async {
      final current = undo;
      if (current == null) return;
      await _save(() async {
        final ok = await ref
            .read(savingsProvider.notifier)
            .undoEntry(current.jarId, current.entryId);
        if (!mounted) return;
        setState(() {
          notice = ok
              ? 'Transaction undone. The original and reversal remain in your history.'
              : 'Undo is unavailable because the balance changed or this transaction was already undone.';
          undo = null;
        });
      });
    }

    Future<void> saveRecurring() async {
      if (_saving) return;
      final value = parseAmountInput(recurringAmount);
      if (value == null) {
        setState(() => error = amountInputHelp);
        return;
      }
      final previous = jar.recurring;
      await _save(() async {
        await ref
            .read(savingsProvider.notifier)
            .editJar(
              jar.id,
              JarEdit(
                recurring: RecurringRule(
                  amount: value,
                  cadence: cadence,
                  paused: previous?.paused ?? false,
                  nextDate: nextRecurringDate(
                    previous: previous,
                    amount: value,
                    cadence: cadence,
                  ),
                ),
              ),
            );
        if (!mounted) return;
        setState(() {
          recurringAmount = '';
          error = '';
          recurringVisible = false;
        });
      });
    }

    Future<void> toggleRecurringPause() async {
      final rule = jar.recurring;
      if (rule == null) return;
      if (rule.paused && !hasValidRecurringSchedule(rule)) {
        setState(() => error = 'Save a valid schedule before resuming it.');
        return;
      }
      final resumeDate = rule.paused
          ? nextRecurringDate(
              previous: RecurringRule(
                amount: rule.amount,
                cadence: rule.cadence,
                paused: rule.paused,
              ),
              amount: rule.amount,
              cadence: rule.cadence,
            )
          : rule.nextDate;
      await _save(() async {
        await ref
            .read(savingsProvider.notifier)
            .editJar(
              jar.id,
              JarEdit(
                recurring: RecurringRule(
                  amount: rule.amount,
                  cadence: rule.cadence,
                  paused: !rule.paused,
                  nextDate: resumeDate,
                ),
              ),
            );
        if (!mounted) return;
        setState(() => recurringVisible = false);
      });
    }

    void openEdit() {
      setState(() {
        editName = jar.name;
        editTarget = jar.target > 0 ? minorToDecimal(jar.target) : '';
        editDeadline = jar.deadline ?? '';
        error = isValidOptionalDeadline(editDeadline) ? '' : deadlineInputHelp;
        editVisible = true;
      });
    }

    Future<void> saveEdit() async {
      if (_saving) return;
      final name = editName.trim();
      final target = parseAmountInput(editTarget);
      if (name.isEmpty || target == null) {
        setState(
          () => error = target == null
              ? amountInputHelp
              : 'Add a name for this jar.',
        );
        return;
      }
      if (!isValidOptionalDeadline(editDeadline)) {
        setState(() => error = deadlineInputHelp);
        return;
      }
      await _save(() async {
        await ref
            .read(savingsProvider.notifier)
            .editJar(
              jar.id,
              JarEdit(name: name, target: target, deadline: editDeadline),
            );
        if (!mounted) return;
        setState(() {
          error = '';
          editVisible = false;
        });
      });
    }

    final nextOccurrence =
        jar.recurring?.nextDate != null && !jar.recurring!.paused
        ? formatDayMonth(parseIso(jar.recurring!.nextDate!))
        : null;

    final screen = ScreenContainer(
      horizontal: false,
      child: Stack(
        children: [
          Positioned.fill(
            child: ExcludeFocus(
              excluding:
                  direction != null ||
                  recurringVisible ||
                  editVisible ||
                  editingEntry != null ||
                  menuVisible ||
                  celebration != null,
              child: ListView.builder(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 36),
                itemCount: jar.entries.length + 1,
                itemBuilder: (context, index) {
                  if (index == 0) {
                    return _header(
                      ref,
                      palette,
                      format,
                      jar: jar,
                      progress: progress,
                      accent: accent,
                      remaining: remaining,
                      nextOccurrence: nextOccurrence,
                    );
                  }
                  final entry = jar.entries[index - 1];
                  return _entryRow(palette, format, jar, entry, accent);
                },
              ),
            ),
          ),

          if (editingEntry != null)
            _EditEntrySheet(
              entry: editingEntry,
              canEdit:
                  editingEntry.undoOf == null &&
                  !jar.entries.any((entry) => entry.undoOf == editingEntry.id),
              format: format,
              onSave: (input) async {
                final ok = await ref
                    .read(savingsProvider.notifier)
                    .correctEntry(jar.id, editingEntry.id, input);
                if (!mounted || !ok) return false;
                setState(() {
                  editingEntryId = null;
                  undo = null;
                  notice = 'Correction saved. Previous values are kept in the transaction history.';
                });
                return true;
              },
              onUndo: () async {
                final ok = await ref
                    .read(savingsProvider.notifier)
                    .undoEntry(jar.id, editingEntry.id);
                if (!mounted || !ok) return false;
                setState(() {
                  editingEntryId = null;
                  undo = null;
                  notice =
                      'Transaction undone. Both records stay in your history.';
                });
                return true;
              },
              onDismiss: () => setState(() => editingEntryId = null),
            ),

          _DepositSheet(
            visible: direction != null,
            direction: direction,
            jarName: jar.name,
            jarBalance: jar.balance,
            currencySymbol: currencySymbol,
            amount: amount,
            note: note,
            error: error,
            presets: presets,
            accent: accent,
            withdrawPreview: withdrawPreview,
            depositPreview: depositPreview,
            depositPreviewPct: depositPreviewPct,
            format: format,
            onAmountChange: (raw) => setState(() {
              amount = raw;
              error = '';
            }),
            onNoteChange: (value) => setState(() => note = value),
            onApplyPreset: (minor) {
              Haptics.tap();
              setState(() {
                amount = minorToDecimal(minor);
                error = '';
              });
            },
            onRecord: record,
            onDismiss: () {
              if (!_saving) setState(_clearTransactionDraft);
            },
          ),

          _RecurringSheet(
            visible: recurringVisible,
            currentAmountMinor: jar.recurring?.amount,
            currentPaused: jar.recurring?.paused ?? false,
            amount: recurringAmount,
            cadence: cadence,
            error: error,
            currencySymbol: currencySymbol,
            accent: accent,
            onAmountChange: (raw) => setState(() {
              recurringAmount = raw;
              error = '';
            }),
            onCadenceChange: (value) => setState(() => cadence = value),
            onSave: saveRecurring,
            onTogglePause: toggleRecurringPause,
            onDismiss: () => setState(() {
              recurringVisible = false;
              error = '';
            }),
          ),

          _EditJarSheet(
            visible: editVisible,
            name: editName,
            target: editTarget,
            deadline: editDeadline,
            kind: jar.kind,
            error: error,
            currencySymbol: currencySymbol,
            accent: accent,
            onNameChange: (value) => setState(() => editName = value),
            onTargetChange: (raw) => setState(() {
              editTarget = raw;
              error = '';
            }),
            onDeadlineChange: (value) => setState(() {
              editDeadline = value;
              error = isValidOptionalDeadline(value) ? '' : deadlineInputHelp;
            }),
            onKindChange: (kind) => _save(
              () => ref
                  .read(savingsProvider.notifier)
                  .editJar(jar.id, JarEdit(kind: kind)),
            ),
            onSave: saveEdit,
            onDismiss: () => setState(() {
              editVisible = false;
              error = '';
            }),
          ),

          ActionSheet(
            visible: menuVisible,
            title: 'Jar options',
            message:
                'Keep its history while removing it from your active goals.',
            actions: [
              SheetAction(
                label: 'Edit jar',
                detail: 'Change its name, target, or deadline.',
                icon: Icons.edit,
                onPress: openEdit,
              ),
              SheetAction(
                label: 'Archive jar',
                detail: 'Hide it from your active goals, keeping its history.',
                icon: Icons.archive,
                onPress: () => _save(() async {
                  await ref.read(savingsProvider.notifier).archiveJar(jar.id);
                  if (context.mounted) context.go('/');
                }),
              ),
              const SheetAction(label: 'Cancel', onPress: _noop),
            ],
            onDismiss: () => setState(() => menuVisible = false),
          ),

          _CelebrationModal(
            visible: celebration != null,
            level: celebration?.level,
            progress: celebration?.progress ?? progress,
            accent: accent,
            icon: jar.icon,
            jarName: jar.name,
            onDismiss: () => setState(() => celebration = null),
          ),

          AppToast(
            visible: undo != null && celebration == null,
            message:
                '${format(undo?.amount ?? 0)} ${undo?.direction == directionDeposit ? 'added to' : 'withdrawn from'} ${undo?.name ?? 'your jar'}',
            actionLabel: 'Undo',
            onAction: performUndo,
            onDismiss: () {
              if (!_saving) setState(() => undo = null);
            },
          ),
          AppToast(
            visible: notice != null,
            message: notice ?? '',
            onDismiss: () => setState(() => notice = null),
            durationMs: 8000,
          ),
          if (_saving)
            Positioned(
              top: 12,
              left: 20,
              right: 20,
              child: Semantics(
                liveRegion: true,
                child: Material(
                  color: palette.surface,
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'Saving…',
                      style: TextStyle(color: palette.foreground),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
    return AbsorbPointer(absorbing: _saving, child: screen);
  }

  static void _noop() {}

  Widget _header(
    WidgetRef ref,
    Palette palette,
    String Function(int) format, {
    required Jar jar,
    required int progress,
    required String accent,
    required int remaining,
    required String? nextOccurrence,
  }) {
    final deposits = effectiveEntries(jar.entries)
        .where((entry) => entry.direction == directionDeposit)
        .length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Pressable(
              onTap: () => context.pop(),
              semantics: 'Go back',
              child: _circle(
                palette,
                Icon(Icons.arrow_back, size: 20, color: palette.foreground),
              ),
            ),
            Expanded(
              child: Text(
                jar.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: palette.foreground,
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
            ),
            Pressable(
              onTap: () => setState(() => menuVisible = true),
              semantics: 'Jar options',
              child: _circle(
                palette,
                Icon(Icons.more_horiz, size: 22, color: palette.foreground),
              ),
            ),
          ],
        ),
        Container(
          margin: const EdgeInsets.only(top: 20),
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: hexAlpha(accent, '12'),
            borderRadius: BorderRadius.circular(28),
          ),
          child: Column(
            children: [
              JarVessel(
                accent: accent,
                icon: jar.icon,
                progress: progress,
                size: JarVesselSize.large,
                label: '$progress%',
                coinDropKey: coinKey,
              ),
              const SizedBox(height: 17),
              Text(
                jar.name,
                textAlign: TextAlign.center,
                style: TextStyle(color: palette.foreground, fontSize: 27),
              ),
              const SizedBox(height: 5),
              Text(
                '$progress% complete',
                style: TextStyle(
                  color: palette.foreground,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 17),
              Text(
                format(jar.balance),
                style: TextStyle(
                  color: palette.foreground,
                  fontSize: 38,
                  height: 46 / 38,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'saved of ${format(jar.target)}',
                style: TextStyle(color: palette.muted, fontSize: 13),
              ),
              if (jar.deadline != null)
                Padding(
                  padding: const EdgeInsets.only(top: 11),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.calendar_today,
                        size: 13,
                        color: palette.muted,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'Target: ${jar.deadline}',
                        style: TextStyle(color: palette.muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 18),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: Container(
                  height: 6,
                  color: palette.border,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: progress / 100,
                      child: Container(color: parseHex(accent)),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 9),
              Text(
                remaining > 0
                    ? '${format(remaining)} to goal'
                    : 'Your goal is fully funded',
                style: TextStyle(color: palette.muted, fontSize: 12),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: _statCard(palette, 'REMAINING', format(remaining))),
            const SizedBox(width: 10),
            Expanded(child: _statCard(palette, 'DEPOSITS', '$deposits')),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(top: 14),
          child: Row(
            children: [
              Expanded(
                child: Pressable(
                  onTap: () => _openTransaction(directionDeposit),
                  semantics: 'Deposit into ${jar.name}',
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 53),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(
                      vertical: 8,
                      horizontal: 4,
                    ),
                    decoration: BoxDecoration(
                      color: palette.primary,
                      borderRadius: BorderRadius.circular(17),
                    ),
                    child: const Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 7,
                      children: [
                        Icon(Icons.add, size: 20, color: Color(0xFFFFFDF9)),
                        Text(
                          'Deposit',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Color(0xFFFFFDF9),
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Pressable(
                  onTap: () => _openTransaction(directionWithdrawal),
                  semantics: 'Withdraw from ${jar.name}',
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 53),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(
                      vertical: 8,
                      horizontal: 4,
                    ),
                    decoration: BoxDecoration(
                      color: palette.surface,
                      borderRadius: BorderRadius.circular(17),
                      border: Border.all(color: palette.border),
                    ),
                    child: Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 7,
                      children: [
                        Icon(Icons.remove, size: 20, color: palette.foreground),
                        Text(
                          'Withdraw',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: palette.foreground,
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (jar.kind == kindHabit && (jar.streak ?? 0) > 0)
          Container(
            margin: const EdgeInsets.only(top: 13),
            constraints: const BoxConstraints(minHeight: 53),
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: hexAlpha(accent, '14'),
              borderRadius: BorderRadius.circular(17),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.local_fire_department,
                  size: 20,
                  color: parseHex(accent),
                ),
                const SizedBox(width: 7),
                Text(
                  '${jar.streak}-day saving streak',
                  style: TextStyle(
                    color: palette.foreground,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
                const Spacer(),
                Text(
                  'Small deposits count.',
                  style: TextStyle(color: palette.muted, fontSize: 11),
                ),
              ],
            ),
          ),
        if (jar.recurring != null)
          _recurringCard(palette, jar, accent, nextOccurrence, format)
        else
          Pressable(
            onTap: () => _openRecurring(null),
            child: Container(
              margin: const EdgeInsets.only(top: 14),
              padding: const EdgeInsets.all(15),
              decoration: BoxDecoration(
                color: palette.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: palette.border),
              ),
              child: Row(
                children: [
                  _recurringIcon(palette, accent, '18'),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Build the habit',
                          style: TextStyle(
                            color: palette.foreground,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Set up a recurring deposit.',
                          style: TextStyle(color: palette.muted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right, size: 22, color: palette.muted),
                ],
              ),
            ),
          ),
        SavingsPlanCard(jar: jar),
        JarReminderSettingsCard(jar: jar),
        Padding(
          padding: const EdgeInsets.only(top: 27, bottom: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Activity',
                style: TextStyle(color: palette.foreground, fontSize: 22),
              ),
              const SizedBox(height: 4),
              Text(
                'Tap a transaction to correct it or view its history.',
                style: TextStyle(color: palette.muted, fontSize: 12),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _recurringCard(
    Palette palette,
    Jar jar,
    String accent,
    String? nextOccurrence,
    String Function(int) format,
  ) {
    final rule = jar.recurring!;
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          _recurringIcon(palette, accent, '20'),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'SCHEDULED SAVING',
                  style: TextStyle(
                    color: palette.muted,
                    letterSpacing: 0.9,
                    fontWeight: FontWeight.w800,
                    fontSize: 10,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${format(rule.amount)} every ${rule.cadence}',
                  style: TextStyle(
                    color: palette.foreground,
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  rule.paused
                      ? 'Currently paused'
                      : nextOccurrence != null
                      ? 'Next deposit: $nextOccurrence'
                      : 'A gentle rhythm for this jar',
                  style: TextStyle(color: palette.muted, fontSize: 11),
                ),
              ],
            ),
          ),
          Pressable(
            onTap: () => _openRecurring(rule),
            semantics: 'Edit recurring deposit',
            child: Text(
              'Edit',
              style: TextStyle(
                color: parseHex(accent),
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _recurringIcon(Palette palette, String accent, String alpha) =>
      Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: hexAlpha(accent, alpha),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(Icons.repeat, size: 19, color: parseHex(accent)),
      );

  Widget _statCard(Palette palette, String label, String value) => Container(
    padding: const EdgeInsets.symmetric(vertical: 13, horizontal: 14),
    decoration: BoxDecoration(
      color: palette.surface,
      borderRadius: BorderRadius.circular(17),
      border: Border.all(color: palette.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            color: palette.muted,
            fontSize: 10,
            letterSpacing: 1.1,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: palette.foreground, fontSize: 19)),
      ],
    ),
  );

  Widget _circle(Palette palette, Widget child) => Container(
    width: 42,
    height: 42,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(15),
      border: Border.all(color: palette.border),
      color: palette.surface,
    ),
    child: Center(child: child),
  );

  Widget _entryRow(
    Palette palette,
    String Function(int) format,
    Jar jar,
    Entry entry,
    String accent,
  ) {
    final isDeposit = entry.direction == directionDeposit;
    final undone = jar.entries.any((candidate) => candidate.undoOf == entry.id);
    final title = entry.undoOf != null
        ? 'Undo record'
        : undone
        ? 'Transaction undone'
        : isDeposit
        ? (entry.source == sourceRecurring
              ? 'Scheduled deposit'
              : 'Money added')
        : 'Money withdrawn';
    return Column(
      children: [
        Pressable(
          onTap: () => setState(() => editingEntryId = entry.id),
          semantics:
              'View ${entry.direction} of ${format(entry.amount)} on ${formatDateIso(entry.at)}',
          child: Container(
            constraints: const BoxConstraints(minHeight: 65),
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 39,
                  height: 39,
                  decoration: BoxDecoration(
                    color: isDeposit
                        ? hexAlpha(accent, '1D')
                        : hexAlpha(toRrggbb(palette.error), '17'),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(
                    isDeposit ? Icons.south : Icons.north,
                    size: 18,
                    color: isDeposit ? parseHex(accent) : palette.error,
                  ),
                ),
                const SizedBox(width: 11),
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
                      const SizedBox(height: 4),
                      Text(
                        '${formatDateIso(entry.at)}'
                        '${entry.note != null ? ' · ${entry.note}' : ''}'
                        '${(entry.revisions?.length ?? 0) > 0 ? ' · Corrected' : ''}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: palette.muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${isDeposit ? '+' : '−'}${format(entry.amount)}',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: isDeposit ? parseHex(accent) : palette.error,
                  ),
                ),
              ],
            ),
          ),
        ),
        Container(
          height: 0.5,
          margin: const EdgeInsets.only(left: 51),
          color: palette.border,
        ),
      ],
    );
  }
}

/// Clamp helper that stays inside web-safe integer range.
int max64(int value) => value < 0 ? 0 : value;

/* -------------------------------------------------------------------------- */
/* Shared sheet building blocks                                                */
/* -------------------------------------------------------------------------- */

class _NoteField extends StatefulWidget {
  const _NoteField({
    required this.palette,
    this.controller,
    this.value,
    this.onChanged,
    required this.hint,
    this.maxLength,
    this.maxLines = 1,
    this.enabled = true,
    this.keyboardType,
  });

  final Palette palette;
  final TextEditingController? controller;
  final String? value;
  final ValueChanged<String>? onChanged;
  final String hint;
  final int? maxLength;
  final int maxLines;
  final bool enabled;
  final TextInputType? keyboardType;

  @override
  State<_NoteField> createState() => _NoteFieldState();
}

class _NoteFieldState extends State<_NoteField> {
  TextEditingController? _fallback;

  TextEditingController get _effective =>
      widget.controller ??
      (_fallback ??= TextEditingController(text: widget.value ?? ''));

  @override
  void didUpdateWidget(_NoteField oldWidget) {
    super.didUpdateWidget(oldWidget);
    final external = widget.value;
    if (external != null &&
        widget.controller == null &&
        _effective.text != external) {
      _effective
        ..text = external
        ..selection = TextSelection.collapsed(offset: external.length);
    }
  }

  @override
  void dispose() {
    _fallback?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final widget = this.widget;
    final palette = widget.palette;
    return Container(
      margin: const EdgeInsets.only(top: 10),
      constraints: const BoxConstraints(minHeight: 49),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: palette.border),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Center(
        child: TextField(
          controller: _effective,
          enabled: widget.enabled,
          onChanged: widget.onChanged,
          maxLength: widget.maxLength,
          maxLines: widget.maxLines,
          keyboardType: widget.keyboardType,
          decoration: InputDecoration(
            hintText: widget.hint,
            hintStyle: TextStyle(color: widget.palette.muted, fontSize: 13),
            border: InputBorder.none,
            counterText: '',
            isDense: true,
          ),
          style: TextStyle(color: widget.palette.foreground, fontSize: 13),
        ),
      ),
    );
  }
}

class _ErrorText extends StatelessWidget {
  const _ErrorText({required this.palette, required this.error});
  final Palette palette;
  final String error;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 18,
      child: Text(error, style: TextStyle(color: palette.error, fontSize: 11)),
    );
  }
}

/* ------------------------------ Deposit sheet ----------------------------- */

class _DepositSheet extends StatelessWidget {
  const _DepositSheet({
    required this.visible,
    required this.direction,
    required this.jarName,
    required this.jarBalance,
    required this.currencySymbol,
    required this.amount,
    required this.note,
    required this.error,
    required this.presets,
    required this.accent,
    required this.withdrawPreview,
    required this.depositPreview,
    required this.depositPreviewPct,
    required this.format,
    required this.onAmountChange,
    required this.onNoteChange,
    required this.onApplyPreset,
    required this.onRecord,
    required this.onDismiss,
  });

  final bool visible;
  final String? direction;
  final String jarName;
  final int jarBalance;
  final String currencySymbol;
  final String amount;
  final String note;
  final String error;
  final List<QuickPreset> presets;
  final String accent;
  final int? withdrawPreview;
  final int? depositPreview;
  final int? depositPreviewPct;
  final String Function(int) format;
  final ValueChanged<String> onAmountChange;
  final ValueChanged<String> onNoteChange;
  final ValueChanged<int> onApplyPreset;
  final VoidCallback onRecord;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final palette = Palette.of(Theme.brightnessOf(context));
    final isDeposit = direction == directionDeposit;
    final enteredAmount = parseAmountInput(amount);
    final withdrawPreview = this.withdrawPreview;
    final depositPreview = this.depositPreview;
    final depositPreviewPct = this.depositPreviewPct;
    final sheet = SheetScaffold(
      visible: visible,
      onDismiss: onDismiss,
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            isDeposit ? 'ADD TO JAR' : 'TAKE MONEY OUT',
            style: TextStyle(
              color: palette.muted,
              fontSize: 10,
              letterSpacing: 1.15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            isDeposit ? 'Every bit adds up.' : 'Use what you need.',
            style: TextStyle(color: palette.foreground, fontSize: 28),
          ),
          const SizedBox(height: 7),
          Text(
            isDeposit
                ? 'Add to $jarName and watch the jar rise.'
                : 'This jar currently holds ${format(jarBalance)}.',
            style: TextStyle(
              color: palette.muted,
              fontSize: 13,
              height: 20 / 13,
            ),
          ),
          if (isDeposit && presets.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 15),
              child: Wrap(
                spacing: 7,
                runSpacing: 7,
                children: [
                  for (final preset in presets)
                    Pressable(
                      onTap: () => onApplyPreset(preset.amount),
                      semantics:
                          '${preset.label}. ${preset.hint}. Adds ${format(preset.amount)}.',
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 34),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 13,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color:
                              amount.isNotEmpty &&
                                  enteredAmount == preset.amount
                              ? hexAlpha(accent, '22')
                              : palette.surface,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                            color:
                                amount.isNotEmpty &&
                                    enteredAmount == preset.amount
                                ? parseHex(accent)
                                : palette.border,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              preset.label,
                              style: TextStyle(
                                color:
                                    amount.isNotEmpty &&
                                        enteredAmount == preset.amount
                                    ? parseHex(accent)
                                    : palette.foreground,
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              preset.hint,
                              style: TextStyle(
                                color:
                                    amount.isNotEmpty &&
                                        enteredAmount == preset.amount
                                    ? parseHex(accent)
                                    : palette.muted,
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          Container(
            margin: const EdgeInsets.only(top: 19),
            constraints: const BoxConstraints(minHeight: 62),
            padding: const EdgeInsets.symmetric(horizontal: 17),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(17),
              border: Border.all(color: palette.border),
            ),
            child: Row(
              children: [
                Text(
                  currencySymbol,
                  style: TextStyle(
                    color: palette.primary,
                    fontSize: 25,
                    fontFamily: 'Georgia',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _ControlledAmountField(
                    palette: palette,
                    value: amount,
                    onChanged: onAmountChange,
                    focusOnOpen: visible,
                  ),
                ),
              ],
            ),
          ),
          if (withdrawPreview != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'Leaves ${format(withdrawPreview)} in this jar.',
                style: TextStyle(color: palette.muted, fontSize: 12),
              ),
            ),
          if (depositPreview != null && depositPreviewPct != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    format(jarBalance),
                    style: TextStyle(color: palette.muted, fontSize: 12),
                  ),
                  Icon(Icons.arrow_forward, size: 13, color: palette.muted),
                  Text(
                    format(depositPreview),
                    style: TextStyle(
                      color: palette.foreground,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    '$depositPreviewPct%',
                    style: TextStyle(
                      color: palette.foreground,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          _NoteField(
            palette: palette,
            value: note,
            onChanged: onNoteChange,
            hint: 'Add a note (optional)',
            maxLength: 80,
          ),
          _ErrorText(palette: palette, error: error),
          Pressable(
            onTap: onRecord,
            child: Container(
              constraints: const BoxConstraints(minHeight: 53),
              decoration: BoxDecoration(
                color: palette.primary,
                borderRadius: BorderRadius.circular(17),
              ),
              child: Center(
                child: Text(
                  isDeposit ? 'Add to jar' : 'Confirm withdrawal',
                  style: const TextStyle(
                    color: Color(0xFFFFFDF9),
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
            ),
          ),
          Pressable(
            onTap: onDismiss,
            child: Container(
              constraints: const BoxConstraints(minHeight: 43),
              child: Center(
                child: Text(
                  'Cancel',
                  style: TextStyle(
                    color: palette.muted,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
    return FocusScope(
      includeSemantics: false,
      canRequestFocus: visible,
      descendantsAreFocusable: visible,
      child: sheet,
    );
  }
}

/// Controlled amount field: the parent owns the original input string.
class _ControlledAmountField extends StatefulWidget {
  const _ControlledAmountField({
    required this.palette,
    required this.value,
    required this.onChanged,
    this.hint = '0',
    this.focusOnOpen = false,
  });

  final Palette palette;
  final String value;
  final ValueChanged<String> onChanged;
  final String hint;
  final bool focusOnOpen;

  @override
  State<_ControlledAmountField> createState() => _ControlledAmountFieldState();
}

class _ControlledAmountFieldState extends State<_ControlledAmountField> {
  final _focus = FocusNode();
  late final TextEditingController _controller = TextEditingController(
    text: widget.value,
  );

  @override
  void didUpdateWidget(_ControlledAmountField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.focusOnOpen && !oldWidget.focusOnOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.focusOnOpen) _focus.requestFocus();
      });
    }
    if (oldWidget.value != widget.value && _controller.text != widget.value) {
      _controller
        ..text = widget.value
        ..selection = TextSelection.collapsed(offset: widget.value.length);
    }
  }

  @override
  void dispose() {
    _focus.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      focusNode: _focus,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: widget.onChanged,
      decoration: InputDecoration(
        hintText: widget.hint,
        hintStyle: TextStyle(color: widget.palette.muted),
        border: InputBorder.none,
        isDense: true,
      ),
      style: TextStyle(
        color: widget.palette.foreground,
        fontSize: 27,
        fontFamily: 'Georgia',
      ),
    );
  }
}

/* ----------------------------- Recurring sheet ---------------------------- */

class _RecurringSheet extends StatelessWidget {
  const _RecurringSheet({
    required this.visible,
    required this.currentAmountMinor,
    required this.currentPaused,
    required this.amount,
    required this.cadence,
    required this.error,
    required this.currencySymbol,
    required this.accent,
    required this.onAmountChange,
    required this.onCadenceChange,
    required this.onSave,
    required this.onTogglePause,
    required this.onDismiss,
  });

  final bool visible;
  final int? currentAmountMinor;
  final bool currentPaused;
  final String amount;
  final String cadence;
  final String error;
  final String currencySymbol;
  final String accent;
  final ValueChanged<String> onAmountChange;
  final ValueChanged<String> onCadenceChange;
  final VoidCallback onSave;
  final VoidCallback onTogglePause;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final palette = Palette.of(Theme.brightnessOf(context));
    final sheet = SheetScaffold(
      visible: visible,
      onDismiss: onDismiss,
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'REPEAT CONTRIBUTION',
            style: TextStyle(
              color: palette.muted,
              fontSize: 10,
              letterSpacing: 1.15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            'Build the habit.',
            style: TextStyle(color: palette.foreground, fontSize: 28),
          ),
          const SizedBox(height: 7),
          Text(
            'Choose a contribution you can repeat comfortably.',
            style: TextStyle(
              color: palette.muted,
              fontSize: 13,
              height: 20 / 13,
            ),
          ),
          Container(
            margin: const EdgeInsets.only(top: 19),
            constraints: const BoxConstraints(minHeight: 62),
            padding: const EdgeInsets.symmetric(horizontal: 17),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(17),
              border: Border.all(color: palette.border),
            ),
            child: Row(
              children: [
                Text(
                  currencySymbol,
                  style: TextStyle(
                    color: palette.primary,
                    fontSize: 25,
                    fontFamily: 'Georgia',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _ControlledAmountField(
                    palette: palette,
                    value: amount,
                    onChanged: onAmountChange,
                    hint: currentAmountMinor == null
                        ? '0'
                        : minorToDecimal(currentAmountMinor!),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                for (final item in cadences)
                  Pressable(
                    onTap: () => onCadenceChange(item),
                    semantics: 'Every $item',
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 36),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: cadence == item
                            ? parseHex(accent)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(11),
                        border: Border.all(
                          color: cadence == item
                              ? parseHex(accent)
                              : palette.border,
                        ),
                      ),
                      child: Text(
                        item,
                        style: TextStyle(
                          color: cadence == item
                              ? const Color(0xFFFFFDF9)
                              : palette.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          _ErrorText(palette: palette, error: error),
          Pressable(
            onTap: onSave,
            child: Container(
              constraints: const BoxConstraints(minHeight: 53),
              decoration: BoxDecoration(
                color: palette.primary,
                borderRadius: BorderRadius.circular(17),
              ),
              child: const Center(
                child: Text(
                  'Save schedule',
                  style: TextStyle(
                    color: Color(0xFFFFFDF9),
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
            ),
          ),
          if (currentAmountMinor != null)
            Pressable(
              onTap: onTogglePause,
              child: Container(
                constraints: const BoxConstraints(minHeight: 43),
                child: Center(
                  child: Text(
                    currentPaused ? 'Resume schedule' : 'Pause schedule',
                    style: TextStyle(
                      color: palette.warning,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                ),
              ),
            ),
          Pressable(
            onTap: onDismiss,
            child: Container(
              constraints: const BoxConstraints(minHeight: 43),
              child: Center(
                child: Text(
                  'Cancel',
                  style: TextStyle(
                    color: palette.muted,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
    return ExcludeFocus(excluding: !visible, child: sheet);
  }
}

/* ------------------------------- Edit jar --------------------------------- */

class _EditJarSheet extends StatelessWidget {
  const _EditJarSheet({
    required this.visible,
    required this.name,
    required this.target,
    required this.deadline,
    required this.kind,
    required this.error,
    required this.currencySymbol,
    required this.accent,
    required this.onNameChange,
    required this.onTargetChange,
    required this.onDeadlineChange,
    required this.onKindChange,
    required this.onSave,
    required this.onDismiss,
  });

  final bool visible;
  final String name;
  final String target;
  final String deadline;
  final String kind;
  final String error;
  final String currencySymbol;
  final String accent;
  final ValueChanged<String> onNameChange;
  final ValueChanged<String> onTargetChange;
  final ValueChanged<String> onDeadlineChange;
  final ValueChanged<String> onKindChange;
  final VoidCallback onSave;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final palette = Palette.of(Theme.brightnessOf(context));
    final sheet = SheetScaffold(
      visible: visible,
      onDismiss: onDismiss,
      palette: palette,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'EDIT JAR',
            style: TextStyle(
              color: palette.muted,
              fontSize: 10,
              letterSpacing: 1.15,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            'Adjust your goal.',
            style: TextStyle(color: palette.foreground, fontSize: 28),
          ),
          const SizedBox(height: 7),
          Text(
            'Change its name, target, or deadline. Your history stays untouched.',
            style: TextStyle(
              color: palette.muted,
              fontSize: 13,
              height: 20 / 13,
            ),
          ),
          _NoteField(
            palette: palette,
            value: name,
            onChanged: onNameChange,
            hint: 'Jar name',
            maxLength: 60,
          ),
          Container(
            margin: const EdgeInsets.only(top: 10),
            constraints: const BoxConstraints(minHeight: 62),
            padding: const EdgeInsets.symmetric(horizontal: 17),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(17),
              border: Border.all(color: palette.border),
            ),
            child: Row(
              children: [
                Text(
                  currencySymbol,
                  style: TextStyle(
                    color: palette.primary,
                    fontSize: 25,
                    fontFamily: 'Georgia',
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _ControlledAmountField(
                    palette: palette,
                    value: target,
                    onChanged: onTargetChange,
                  ),
                ),
              ],
            ),
          ),
          _NoteField(
            palette: palette,
            value: deadline,
            onChanged: onDeadlineChange,
            hint: 'Deadline (YYYY-MM-DD or Month Year, optional)',
            maxLength: 40,
          ),
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                for (final item in [kindGoal, kindHabit])
                  Pressable(
                    onTap: () => onKindChange(item),
                    semantics: '$item jar',
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 36),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: kind == item
                            ? parseHex(accent)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(11),
                        border: Border.all(
                          color: kind == item
                              ? parseHex(accent)
                              : palette.border,
                        ),
                      ),
                      child: Text(
                        item == kindGoal ? 'Goal' : 'Habit',
                        style: TextStyle(
                          color: kind == item
                              ? const Color(0xFFFFFDF9)
                              : palette.muted,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          _ErrorText(palette: palette, error: error),
          Pressable(
            onTap: onSave,
            child: Container(
              constraints: const BoxConstraints(minHeight: 53),
              decoration: BoxDecoration(
                color: palette.primary,
                borderRadius: BorderRadius.circular(17),
              ),
              child: const Center(
                child: Text(
                  'Save changes',
                  style: TextStyle(
                    color: Color(0xFFFFFDF9),
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
            ),
          ),
          Pressable(
            onTap: onDismiss,
            child: Container(
              constraints: const BoxConstraints(minHeight: 43),
              child: Center(
                child: Text(
                  'Cancel',
                  style: TextStyle(
                    color: palette.muted,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
    return ExcludeFocus(excluding: !visible, child: sheet);
  }
}

/* --------------------------- Transaction edit ------------------------------ */

class _EditEntrySheet extends StatefulWidget {
  const _EditEntrySheet({
    required this.entry,
    required this.canEdit,
    required this.format,
    required this.onSave,
    required this.onUndo,
    required this.onDismiss,
  });

  final Entry entry;
  final bool canEdit;
  final String Function(int) format;
  final Future<bool> Function(EntryCorrection input) onSave;
  final Future<bool> Function() onUndo;
  final VoidCallback onDismiss;

  @override
  State<_EditEntrySheet> createState() => _EditEntrySheetState();
}

class _EditEntrySheetState extends State<_EditEntrySheet> {
  late final TextEditingController _amount = TextEditingController(
    text: minorToDecimal(widget.entry.amount),
  );
  late final TextEditingController _date = TextEditingController(
    text: localDateIso(parseIso(widget.entry.at)),
  );
  late final TextEditingController _note = TextEditingController(
    text: widget.entry.note ?? '',
  );
  String _error = '';
  bool _saving = false;

  Future<void> _save(Future<bool> Function() action, String invalid) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = '';
    });
    try {
      final ok = await action();
      if (mounted && !ok) setState(() => _error = invalid);
    } on StoreException catch (caught) {
      if (mounted) setState(() => _error = caught.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    _date.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (_saving) return;
    final minor = parseAmountInput(_amount.text);
    final dateOk = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(_date.text);
    final chosenDate = dateOk ? parseDeadline(_date.text) : null;
    if (minor == null || chosenDate == null) {
      setState(
        () => _error = minor == null
            ? amountInputHelp
            : 'Enter a valid date (YYYY-MM-DD).',
      );
      return;
    }
    final at = _date.text == localDateIso(parseIso(widget.entry.at))
        ? widget.entry.at
        : toIso(chosenDate);
    await _save(
      () => widget.onSave(
        EntryCorrection(
          amount: minor,
          at: at,
          note: _note.text.trim().isEmpty ? null : _note.text.trim(),
        ),
      ),
      'This change cannot be saved. Check the date and balance; earlier withdrawals must remain funded.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final palette = Palette.of(Theme.brightnessOf(context));
    final format = widget.format;
    return SheetScaffold(
      visible: true,
      onDismiss: () {
        if (!_saving) widget.onDismiss();
      },
      palette: palette,
      child: AbsorbPointer(
        absorbing: _saving,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Transaction details',
              style: TextStyle(color: palette.foreground, fontSize: 20),
            ),
            const SizedBox(height: 8),
            Text(
              widget.entry.undoOf != null
                  ? 'This is an Undo record.'
                  : widget.canEdit
                  ? 'Correct the amount, date, or note. Previous values stay in the history.'
                  : 'This transaction has been undone. Its original record is kept below.',
              style: TextStyle(
                color: palette.muted,
                fontSize: 13,
                height: 19 / 13,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Amount',
              style: TextStyle(
                color: palette.muted,
                fontWeight: FontWeight.w800,
                fontSize: 11,
              ),
            ),
            _NoteField(
              palette: palette,
              controller: _amount,
              enabled: widget.canEdit,
              hint: '',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Date (YYYY-MM-DD)',
              style: TextStyle(
                color: palette.muted,
                fontWeight: FontWeight.w800,
                fontSize: 11,
              ),
            ),
            _NoteField(
              palette: palette,
              controller: _date,
              enabled: widget.canEdit,
              hint: '',
              maxLength: 10,
            ),
            const SizedBox(height: 6),
            Text(
              'Note',
              style: TextStyle(
                color: palette.muted,
                fontWeight: FontWeight.w800,
                fontSize: 11,
              ),
            ),
            _NoteField(
              palette: palette,
              controller: _note,
              enabled: widget.canEdit,
              hint: '',
              maxLength: 500,
              maxLines: 3,
            ),
            if (_error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  _error,
                  style: TextStyle(color: palette.error, fontSize: 11),
                ),
              ),
            if (_saving) const Text('Saving…'),
            if (widget.canEdit) ...[
              const SizedBox(height: 8),
              Pressable(
                onTap: save,
                child: Container(
                  constraints: const BoxConstraints(minHeight: 53),
                  decoration: BoxDecoration(
                    color: palette.primary,
                    borderRadius: BorderRadius.circular(17),
                  ),
                  child: const Center(
                    child: Text(
                      'Save correction',
                      style: TextStyle(
                        color: Color(0xFFFFFDF9),
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
              ),
              Pressable(
                onTap: () => _save(
                  widget.onUndo,
                  'Undo is unavailable because this balance has changed or the transaction was already undone.',
                ),
                child: Container(
                  margin: const EdgeInsets.only(top: 8),
                  constraints: const BoxConstraints(minHeight: 53),
                  decoration: BoxDecoration(
                    color: palette.surface,
                    borderRadius: BorderRadius.circular(17),
                    border: Border.all(color: palette.border),
                  ),
                  child: Center(
                    child: Text(
                      'Undo this ${widget.entry.direction == directionDeposit ? 'deposit' : 'withdrawal'}',
                      style: TextStyle(
                        color: palette.foreground,
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                      ),
                    ),
                  ),
                ),
              ),
            ],
            if ((widget.entry.revisions?.length ?? 0) > 0) ...[
              const SizedBox(height: 14),
              Text(
                'Previous values',
                style: TextStyle(
                  color: palette.muted,
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
              const SizedBox(height: 6),
              for (final revision in widget.entry.revisions!.reversed)
                Container(
                  margin: const EdgeInsets.only(top: 6),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: palette.background,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: palette.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${format(revision.amount)} · ${formatDateIso(revision.at)}',
                        style: TextStyle(color: palette.muted, fontSize: 12),
                      ),
                      if (revision.note != null)
                        Text(
                          revision.note!,
                          style: TextStyle(color: palette.muted, fontSize: 12),
                        ),
                      Text(
                        'Corrected ${formatDateTime(parseIso(revision.changedAt))}',
                        style: TextStyle(color: palette.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
            ],
            const SizedBox(height: 10),
            Pressable(
              onTap: widget.onDismiss,
              child: Container(
                constraints: const BoxConstraints(minHeight: 53),
                decoration: BoxDecoration(
                  color: palette.surface,
                  borderRadius: BorderRadius.circular(17),
                  border: Border.all(color: palette.border),
                ),
                child: Center(
                  child: Text(
                    'Close',
                    style: TextStyle(
                      color: palette.foreground,
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/* --------------------------- Action sheet menu ----------------------------- */

/* ------------------------------- Celebration ------------------------------- */

class _CelebrationModal extends StatelessWidget {
  const _CelebrationModal({
    required this.visible,
    required this.level,
    required this.progress,
    required this.accent,
    required this.icon,
    required this.jarName,
    required this.onDismiss,
  });

  final bool visible;
  final int? level;
  final int progress;
  final String accent;
  final String icon;
  final String jarName;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final palette = Palette.of(Theme.brightnessOf(context));
    return SheetScaffold(
      visible: visible,
      onDismiss: onDismiss,
      palette: palette,
      centerCard: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${level ?? progress}%',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.primary,
              fontSize: 46,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Center(
            child: JarVessel(
              accent: accent,
              icon: icon,
              progress: progress,
              size: JarVesselSize.medium,
            ),
          ),
          const SizedBox(height: 17),
          Text(
            level == 100
                ? 'You made it.'
                : level == 50
                ? 'Halfway there.'
                : 'A beautiful milestone.',
            textAlign: TextAlign.center,
            style: TextStyle(color: palette.foreground, fontSize: 27),
          ),
          const SizedBox(height: 9),
          Text(
            '$jarName is now ${level ?? progress}% funded. Small, steady progress is real progress.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: palette.muted,
              fontSize: 13,
              height: 20 / 13,
            ),
          ),
          const SizedBox(height: 21),
          Pressable(
            onTap: onDismiss,
            child: Container(
              constraints: const BoxConstraints(minHeight: 52),
              decoration: BoxDecoration(
                color: palette.primary,
                borderRadius: BorderRadius.circular(17),
              ),
              child: const Center(
                child: Text(
                  'Keep saving',
                  style: TextStyle(
                    color: Color(0xFFFFFDF9),
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
