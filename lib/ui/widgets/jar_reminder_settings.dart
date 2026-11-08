/// Per-jar personal reminder editor: enable switch, 24h time inputs, weekday
/// checkboxes, snooze/clear. Port of `components/jar-reminder-settings.tsx`.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/hex_color.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../state/providers.dart';
import '../../state/savings_controller.dart';

const List<String> _days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const JarReminder _defaultReminder = JarReminder(
  enabled: true,
  hour: 9,
  minute: 0,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
);

class JarReminderSettingsCard extends ConsumerStatefulWidget {
  const JarReminderSettingsCard({super.key, required this.jar});

  final Jar jar;

  @override
  ConsumerState<JarReminderSettingsCard> createState() =>
      _JarReminderSettingsCardState();
}

class _JarReminderSettingsCardState
    extends ConsumerState<JarReminderSettingsCard> {
  late bool _enabled;
  late String _hour;
  late String _minute;
  late List<int> _weekdays;
  String _message = '';
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    _syncFromJar();
  }

  @override
  void didUpdateWidget(JarReminderSettingsCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.jar.id != widget.jar.id ||
        oldWidget.jar.reminder != widget.jar.reminder) {
      _syncFromJar();
    }
  }

  void _syncFromJar() {
    final reminder = widget.jar.reminder ?? _defaultReminder;
    _enabled = reminder.enabled;
    _hour = reminder.hour.toString().padLeft(2, '0');
    _minute = reminder.minute.toString().padLeft(2, '0');
    _weekdays = [...reminder.weekdays];
  }

  void save({String action = 'save'}) {
    final reminder = widget.jar.reminder ?? _defaultReminder;
    final hour = RegExp(r'^\d{1,2}$').hasMatch(_hour) ? int.parse(_hour) : -1;
    final minute =
        RegExp(r'^\d{1,2}$').hasMatch(_minute) ? int.parse(_minute) : -1;
    final next = JarReminder(
      enabled: _enabled,
      hour: hour,
      minute: minute,
      weekdays: _weekdays,
      snoozedUntil: action == 'clear' ? null : reminder.snoozedUntil,
    );
    if (!isValidJarReminder(next)) {
      setState(() => _message =
          'Choose a time from 00:00 to 23:59 and at least one weekday.');
      return;
    }
    try {
      ref.read(savingsProvider.notifier).editJar(
            widget.jar.id,
            JarEdit(
              reminder: action == 'snooze' ? snoozeReminderOneDay(next) : next,
            ),
          );
      setState(() {
        _message = 'Reminder settings saved.';
        _expanded = false;
      });
    } catch (caught) {
      setState(() => _message = 'Could not save your reminder.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final settings = ref.watch(settingsProvider).value;
    final remindersEnabled = settings?.remindersEnabled ?? false;
    final reminder = widget.jar.reminder ?? _defaultReminder;
    final next = nextReminderDates(reminder).firstOrNull;
    final snoozed = reminder.snoozedUntil != null &&
        DateTime.tryParse(reminder.snoozedUntil!) != null &&
        parseIso(reminder.snoozedUntil!).isAfter(DateTime.now());

    final statusCopy = widget.jar.reminder == null
        ? 'Using default reminders.'
        : !reminder.enabled
            ? 'Personal reminder paused.'
            : snoozed
                ? 'Snoozed until ${formatDateTime(parseIso(reminder.snoozedUntil!))}.'
                : next != null
                    ? 'Next reminder: ${formatDateTime(next)}.'
                    : 'No personal reminders scheduled.';

    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Personal reminder',
              style: TextStyle(
                  color: palette.foreground,
                  fontWeight: FontWeight.w800,
                  fontSize: 15)),
          const SizedBox(height: 5),
          Text(statusCopy,
              style:
                  TextStyle(color: palette.muted, fontSize: 12, height: 17 / 12)),
          const SizedBox(height: 10),
          _secondaryButton(
            palette,
            _expanded
                ? 'Hide reminder settings'
                : widget.jar.reminder != null
                    ? 'Edit reminder'
                    : 'Set reminder',
            () => setState(() => _expanded = !_expanded),
          ),
          if (_message.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_message,
                  style: TextStyle(
                      color: palette.muted, fontSize: 12, height: 17 / 12)),
            ),
          if (_expanded) ...[
            const SizedBox(height: 8),
            Text(
              'Choose when to check in. Reminders never record a deposit or change automatic deposits.',
              style:
                  TextStyle(color: palette.muted, fontSize: 12, height: 17 / 12),
            ),
            if (widget.jar.reminder == null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'Using default reminders until you save a personal schedule.',
                  style: TextStyle(
                      color: palette.muted, fontSize: 12, height: 17 / 12),
                ),
              ),
            Row(
              children: [
                const Expanded(
                  child: Text('Personal schedule enabled',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w800)),
                ),
                Switch(
                  value: _enabled,
                  onChanged: (value) => setState(() => _enabled = value),
                ),
              ],
            ),
            Text('Local time (24-hour)',
                style: TextStyle(
                    color: palette.muted,
                    fontWeight: FontWeight.w800,
                    fontSize: 11)),
            const SizedBox(height: 6),
            Row(
              children: [
                _timeField(palette, _hour, (value) => setState(() {
                      _hour = value.replaceAll(RegExp(r'[^0-9]'), '');
                    })),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Text(':',
                      style: TextStyle(
                          color: palette.muted,
                          fontWeight: FontWeight.w800,
                          fontSize: 13)),
                ),
                _timeField(palette, _minute, (value) => setState(() {
                      _minute = value.replaceAll(RegExp(r'[^0-9]'), '');
                    })),
              ],
            ),
            const SizedBox(height: 10),
            Text('Weekdays',
                style: TextStyle(
                    color: palette.muted,
                    fontWeight: FontWeight.w800,
                    fontSize: 11)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (var index = 0; index < _days.length; index++)
                  PressableRect(
                    onTap: () => setState(() {
                      if (_weekdays.contains(index)) {
                        _weekdays = _weekdays.where((d) => d != index).toList();
                      } else {
                        _weekdays = [..._weekdays, index]..sort();
                      }
                    }),
                    semantics: '${_days[index]} reminder',
                    selected: _weekdays.contains(index),
                    palette: palette,
                    label: _days[index],
                  ),
              ],
            ),
            const SizedBox(height: 12),
            _primaryButton(palette, 'Save reminder', () => save()),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _secondaryButton(
                      palette, 'Snooze one day', () => save(action: 'snooze')),
                ),
                if (snoozed) ...[
                  const SizedBox(width: 8),
                  Expanded(
                    child: _secondaryButton(
                        palette, 'Clear snooze', () => save(action: 'clear')),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 10),
            Text(
              kIsWeb
                  ? 'Web saves your preferences; OS reminders are available in the native app.'
                  : !remindersEnabled
                      ? 'Notifications are off. Enable Saving reminders in Profile and allow device notifications to receive reminders.'
                      : 'Delivery requires device notification permission. Manage Saving reminders in Profile.',
              style:
                  TextStyle(color: palette.muted, fontSize: 12, height: 17 / 12),
            ),
            const SizedBox(height: 8),
            Text(
              'The daily 09:00 savings summary stays separate. Up to 63 upcoming jar reminders share the device queue. Open the app regularly to refill it; reminders stop when the queue runs out. With many jars, each gets fewer dates; above 63 eligible jars, some get no slots. Open after changing time zones. Clock times skipped by daylight saving are skipped.',
              style:
                  TextStyle(color: palette.muted, fontSize: 12, height: 17 / 12),
            ),
            if (widget.jar.isArchived ||
                (widget.jar.target > 0 && widget.jar.balance >= widget.jar.target))
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  'This jar is archived or funded, so its personal reminders are quiet.',
                  style: TextStyle(
                      color: palette.muted, fontSize: 12, height: 17 / 12),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _timeField(
      Palette palette, String value, ValueChanged<String> onChanged) {
    return SizedBox(
      width: 56,
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        decoration: BoxDecoration(
          color: palette.background,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: palette.border),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Center(
          child: TextField(
            keyboardType: TextInputType.number,
            maxLength: 2,
            textAlign: TextAlign.center,
            onChanged: onChanged,
            controller: TextEditingController(text: value)
              ..selection = TextSelection.collapsed(offset: value.length),
            decoration: const InputDecoration(
              border: InputBorder.none,
              counterText: '',
              isDense: true,
            ),
            style: TextStyle(color: palette.foreground, fontSize: 15),
          ),
        ),
      ),
    );
  }

  Widget _primaryButton(Palette palette, String label, VoidCallback onTap) {
    return PressableRect(
      onTap: onTap,
      semantics: label,
      palette: palette,
      filled: true,
      label: label,
    );
  }

  Widget _secondaryButton(Palette palette, String label, VoidCallback onTap) {
    return PressableRect(
      onTap: onTap,
      semantics: label,
      palette: palette,
      label: label,
    );
  }
}

/// Simple bordered chip button for the reminder card.
class PressableRect extends StatelessWidget {
  const PressableRect({
    super.key,
    required this.onTap,
    required this.palette,
    required this.label,
    this.selected = false,
    this.filled = false,
    this.semantics,
  });

  final VoidCallback onTap;
  final Palette palette;
  final String label;
  final bool selected;
  final bool filled;
  final String? semantics;

  @override
  Widget build(BuildContext context) {
    return _PressableRect(
      onTap: onTap,
      semantics: semantics ?? label,
      child: Container(
        constraints: BoxConstraints(minHeight: filled ? 46 : 36),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled
              ? palette.primary
              : selected
                  ? hexAlpha(toRrggbb(palette.primary), '22')
                  : palette.background,
          borderRadius: BorderRadius.circular(11),
          border: Border.all(
            color: selected && !filled ? palette.primary : palette.border,
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: filled
                ? const Color(0xFFFFFDF9)
                : selected
                    ? palette.foreground
                    : palette.muted,
            fontSize: filled ? 14 : 11,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _PressableRect extends StatefulWidget {
  const _PressableRect({
    required this.child,
    required this.onTap,
    required this.semantics,
  });

  final Widget child;
  final VoidCallback onTap;
  final String semantics;

  @override
  State<_PressableRect> createState() => _PressableRectState();
}

class _PressableRectState extends State<_PressableRect> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.semantics,
      child: GestureDetector(
        onTap: widget.onTap,
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        behavior: HitTestBehavior.opaque,
        child: AnimatedOpacity(
          opacity: _pressed ? 0.86 : 1,
          duration: const Duration(milliseconds: 100),
          child: widget.child,
        ),
      ),
    );
  }
}
