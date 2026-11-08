/// Home: quiet content-led list of in-progress jars beneath a total-balance
/// hero card, with saving reminders and completed jars at the end.
///
/// Port of `app/(tabs)/index.tsx` + `components/home.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart' show LongPressGestureRecognizer;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../activity/jar_reminders.dart';
import '../../state/providers.dart';
import '../../state/savings_controller.dart';
import '../widgets/jar_vessel.dart';
import '../widgets/screen_container.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _remindersExpanded = false;

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final savingsAsync = ref.watch(savingsProvider);
    final settings = ref.watch(settingsProvider).value;
    final currency = settings?.currency ?? 'USD';

    return savingsAsync.when(
      loading: () => ScreenContainer(
        child: Center(child: CircularProgressIndicator(color: palette.primary)),
      ),
      error: (error, stack) =>
          _body(ref, palette, SavingsState.initial, currency),
      data: (savings) => _body(ref, palette, savings, currency),
    );
  }

  Widget _body(
    WidgetRef ref,
    Palette palette,
    SavingsState savings,
    String currency,
  ) {
    final active = savings.jars.where((jar) => !jar.isArchived).toList();
    final inProgress = [
      for (final jar in active)
        if (percent(jar) < 100) jar,
    ];
    final completed = [
      for (final jar in active)
        if (percent(jar) >= 100) jar,
    ];
    final reminders = jarReminders(active, DateTime.now(), currency);
    final weeklyDeltaValue = weeklyDelta(active);
    final format = ref.watch(moneyFormatterProvider);

    if (!savings.ready) {
      return ScreenContainer(
        child: Center(child: CircularProgressIndicator(color: palette.primary)),
      );
    }

    return ScreenContainer(
      child: ListView.builder(
        itemCount: 1 + inProgress.length + (completed.isNotEmpty ? 1 : 0),
        padding: const EdgeInsets.only(top: 14, bottom: 24),
        itemBuilder: (context, index) {
          if (index == 0) {
            return _header(
              ref,
              palette,
              savings,
              active,
              inProgress,
              reminders,
              weeklyDeltaValue,
              currency,
            );
          }
          final jarIndex = index - 1;
          if (jarIndex < inProgress.length) {
            return Padding(
              padding: const EdgeInsets.only(top: 12),
              child: GoalCard(jar: inProgress[jarIndex], format: format),
            );
          }
          return _completedBlock(ref, palette, completed, format);
        },
      ),
    );
  }

  Widget _completedBlock(
    WidgetRef ref,
    Palette palette,
    List<Jar> completed,
    String Function(int) format,
  ) {
    return Padding(
      padding: const EdgeInsets.only(top: 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.verified, size: 15, color: palette.success),
              const SizedBox(width: 6),
              Text(
                'Completed',
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.9,
                ),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                decoration: BoxDecoration(
                  color: palette.border,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '${completed.length}',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final jar in completed)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GoalCard(jar: jar, format: format),
            ),
        ],
      ),
    );
  }

  Widget _header(
    WidgetRef ref,
    Palette palette,
    SavingsState savings,
    List<Jar> active,
    List<Jar> inProgress,
    List<JarReminderRow> reminders,
    int weeklyDeltaValue,
    String currency,
  ) {
    final format = ref.watch(moneyFormatterProvider);
    final shownReminders = _remindersExpanded
        ? reminders
        : reminders.take(2).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'SAVING JAR',
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 12,
                        letterSpacing: 1.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Give your goals\nsomewhere to grow.',
                      style: TextStyle(
                        color: palette.foreground,
                        fontSize: 29,
                        height: 34 / 29,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _Pressable(
                borderRadius: 16,
                onTap: () => context.go('/profile'),
                semantics: 'Open profile',
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: palette.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: palette.border),
                  ),
                  child: Icon(Icons.tune, size: 20, color: palette.foreground),
                ),
              ),
            ],
          ),
        ),

        // Balance hero
        Container(
          margin: const EdgeInsets.only(top: 23),
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            color: const Color(0xFF3B2D24),
            borderRadius: BorderRadius.circular(27),
            boxShadow: const [
              BoxShadow(
                color: Color(0x383B2D24),
                blurRadius: 18,
                offset: Offset(0, 12),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      "YOU'VE SAVED · $currency",
                      style: const TextStyle(
                        color: Color(0xFFE8D9C8),
                        fontSize: 12,
                        letterSpacing: 1.15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: const Color(0x2BFFFDF9),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.savings,
                      size: 18,
                      color: Color(0xFFFFFDF9),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Semantics(
                label: '${format(savings.total)} saved',
                child: Text(
                  _plainAmount(savings.total),
                  style: const TextStyle(
                    color: Color(0xFFFFFDF9),
                    fontSize: 37,
                    height: 46 / 37,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 15),
              Container(
                padding: const EdgeInsets.only(top: 14),
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Color(0x38FFFDF9), width: 0.5),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        active.isNotEmpty
                            ? 'Across ${active.length} active ${active.length == 1 ? 'jar' : 'jars'}'
                            : 'A home for every goal that matters',
                        style: const TextStyle(
                          color: Color(0xFFE8D9C8),
                          fontSize: 13,
                        ),
                      ),
                    ),
                    if (active.isNotEmpty)
                      Text(
                        weeklyDeltaValue > 0
                            ? '+${format(weeklyDeltaValue)} this week'
                            : 'Keep going',
                        style: const TextStyle(
                          color: Color(0xFFFFFDF9),
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),

        // Reminders
        if (reminders.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 24),
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    'Saving reminders',
                    style: TextStyle(
                      color: palette.foreground,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${reminders.length}',
                  style: TextStyle(color: palette.muted, fontSize: 14),
                ),
              ],
            ),
          ),
        for (final reminder in shownReminders)
          _reminderCard(ref, palette, reminder),
        if (reminders.length > 2)
          _Pressable(
            onTap: () =>
                setState(() => _remindersExpanded = !_remindersExpanded),
            semantics: _remindersExpanded
                ? 'Show fewer reminders'
                : 'View all ${reminders.length} reminders',
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Flexible(
                    child: Text(
                      _remindersExpanded
                          ? 'Show fewer reminders'
                          : 'View all ${reminders.length} reminders',
                      style: TextStyle(
                        color: palette.foreground,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Icon(
                    _remindersExpanded ? Icons.expand_less : Icons.expand_more,
                    size: 20,
                    color: palette.foreground,
                  ),
                ],
              ),
            ),
          ),

        // Section header
        Padding(
          padding: const EdgeInsets.only(top: 28, bottom: 13),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  inProgress.isNotEmpty || active.isEmpty
                      ? 'Your jars'
                      : 'All jars complete',
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 22,
                    fontFamily: 'Georgia',
                  ),
                ),
              ),
              _Pressable(
                borderRadius: 13,
                onTap: () => context.push('/jar/new'),
                semantics: 'Create a new jar',
                child: Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: palette.foreground,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add, size: 18, color: palette.background),
                      const SizedBox(width: 5),
                      Text(
                        'New jar',
                        style: TextStyle(
                          color: palette.background,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),

        // Empty state
        if (inProgress.isEmpty)
          Container(
            padding: const EdgeInsets.all(26),
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: palette.border),
            ),
            child: Column(
              children: [
                JarVessel(
                  accent: accentFor('amber', palette),
                  icon: 'star',
                  progress: 0,
                  size: JarVesselSize.medium,
                ),
                const SizedBox(height: 14),
                Text(
                  'Make saving feel real.',
                  style: TextStyle(color: palette.foreground, fontSize: 24),
                ),
                const SizedBox(height: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 275),
                  child: Text(
                    'Create a jar for what matters, then let each small contribution show up.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 13,
                      height: 19 / 13,
                    ),
                  ),
                ),
                const SizedBox(height: 21),
                _Pressable(
                  borderRadius: 16,
                  onTap: () => context.push('/jar/new'),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 52),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: palette.primary,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'Create your first jar',
                          style: TextStyle(
                            color: Color(0xFFFFFDF9),
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(
                          Icons.arrow_forward,
                          size: 18,
                          color: Color(0xFFFFFDF9),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _reminderCard(
    WidgetRef ref,
    Palette palette,
    JarReminderRow reminder,
  ) {
    final accent = accentFor(reminder.jar.accent, palette);
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: _Pressable(
        borderRadius: 18,
        onTap: () => context.push('/jar/${reminder.jar.id}?action=deposit'),
        semantics: 'Add money to ${reminder.title}. ${reminder.detail}',
        child: Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: palette.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: hexAlpha(toRrggbb(palette.primary), '55'),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                margin: const EdgeInsets.only(top: 4),
                decoration: BoxDecoration(
                  color: hexAlpha(accent, '20'),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.notifications_active,
                  size: 17,
                  color: parseHex(accent),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            reminder.title,
                            style: TextStyle(
                              color: palette.foreground,
                              fontSize: 15,
                              height: 22 / 15,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          constraints: const BoxConstraints(minHeight: 44),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: palette.background,
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Text(
                            '+ Add',
                            style: TextStyle(
                              color: palette.foreground,
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      reminder.detail,
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 13,
                        height: 20 / 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class GoalCard extends ConsumerWidget {
  const GoalCard({super.key, required this.jar, required this.format});

  final Jar jar;
  final String Function(int) format;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    final progress = percent(jar);
    final accent = accentFor(jar.accent, palette);
    final countdown = deadlineCountdown(jar.deadline);
    final urgent = isUrgentDeadline(countdown);
    final isHabitStreak = jar.kind == kindHabit && (jar.streak ?? 0) > 0;
    final meta = isHabitStreak
        ? '${jar.streak}-day streak'
        : (countdown ?? 'A goal in progress');
    final metaIcon = isHabitStreak
        ? Icons.local_fire_department
        : countdown != null
        ? Icons.calendar_today
        : Icons.flag;

    return Container(
      constraints: const BoxConstraints(minHeight: 114),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        children: [
          _Pressable(
            onTap: () => context.push('/jar/${jar.id}'),
            onLongPress: () => context.push('/jar/${jar.id}?action=deposit'),
            longPressDelay: const Duration(milliseconds: 320),
            semantics:
                '${jar.name}. $progress% complete. ${format(jar.balance)} saved of ${format(jar.target)}.',
            child: Row(
              children: [
                SizedBox(
                  width: 77,
                  child: Center(
                    child: JarVessel(
                      accent: accent,
                      icon: jar.icon,
                      progress: progress,
                      size: JarVesselSize.small,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        jar.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.foreground,
                          fontSize: 16,
                          height: 22 / 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        format(jar.balance),
                        style: TextStyle(
                          color: palette.foreground,
                          fontSize: 21,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'of ${format(jar.target)} goal',
                        style: TextStyle(
                          color: palette.muted,
                          fontWeight: FontWeight.w500,
                          fontSize: 13,
                          height: 19 / 13,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: Container(
                              height: 5,
                              decoration: BoxDecoration(
                                color: palette.border,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: FractionallySizedBox(
                                  widthFactor: progress / 100,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: parseHex(accent),
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '$progress%',
                            style: TextStyle(
                              color: palette.foreground,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Icon(
                      metaIcon,
                      size: 16,
                      color: urgent ? palette.warning : palette.muted,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        meta,
                        style: TextStyle(
                          color: urgent ? palette.foreground : palette.muted,
                          fontSize: 13,
                          height: 19 / 13,
                          fontWeight: urgent
                              ? FontWeight.w700
                              : FontWeight.w400,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _Pressable(
                borderRadius: 11,
                onTap: () => context.push('/jar/${jar.id}?action=deposit'),
                semantics: 'Add money to ${jar.name}',
                child: Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 11,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: hexAlpha(accent, '1F'),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: Center(
                    child: Text(
                      '+ Add',
                      style: TextStyle(
                        color: palette.foreground,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The RN `Pressable` feel: opacity + scale while pressed, optional long press
/// with the original 320ms delay, tap suppressed once the long press fires.
class _Pressable extends StatefulWidget {
  const _Pressable({
    required this.child,
    required this.onTap,
    this.onLongPress,
    this.longPressDelay = const Duration(milliseconds: 320),
    this.borderRadius = 12,
    this.semantics,
  });

  final Widget child;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final Duration longPressDelay;
  final double borderRadius;
  final String? semantics;

  @override
  State<_Pressable> createState() => _PressableState();
}

class _PressableState extends State<_Pressable> {
  bool _pressed = false;
  bool _longFired = false;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.semantics,
      child: RawGestureDetector(
        // Custom long-press duration: the original app used 320ms.
        gestures: {
          if (widget.onLongPress != null)
            LongPressGestureRecognizer:
                GestureRecognizerFactoryWithHandlers<
                  LongPressGestureRecognizer
                >(
                  () => LongPressGestureRecognizer(
                    duration: widget.longPressDelay,
                  ),
                  (instance) => instance.onLongPress = () {
                    setState(() => _longFired = true);
                    widget.onLongPress!();
                  },
                ),
        },
        child: GestureDetector(
          onTap: _longFired ? null : widget.onTap,
          onTapDown: (_) {
            _longFired = false;
            setState(() => _pressed = true);
          },
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          behavior: HitTestBehavior.opaque,
          child: AnimatedScale(
            scale: _pressed ? 0.98 : 1,
            duration: const Duration(milliseconds: 100),
            child: AnimatedOpacity(
              opacity: _pressed ? 0.86 : 1,
              duration: const Duration(milliseconds: 100),
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }
}

/// Grouped digits without a currency sign, matching the hero card's
/// Intl.NumberFormat formatting in the original.
String _plainAmount(int minor) {
  final dollars = minor ~/ 100;
  final cents = (minor % 100).abs().toString().padLeft(2, '0');
  final digits = dollars.abs().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    final remaining = digits.length - i;
    buffer.write(digits[i]);
    if (remaining > 1 && (remaining - 1) % 3 == 0) buffer.write(',');
  }
  final sign = minor < 0 ? '-' : '';
  return '$sign$buffer.$cents';
}
