/// Insights: totals, glance metrics, closest goal, monthly contributions, and
/// the badge catalogue.
///
/// Port of `app/(tabs)/stats.tsx` + `components/stats.styles.ts`.
library;

import 'package:flutter/material.dart' hide Badge;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../state/providers.dart';
import '../widgets/screen_container.dart';

class InsightsScreen extends ConsumerWidget {
  const InsightsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    final format = ref.watch(moneyFormatterProvider);
    final savings = ref.watch(savingsProvider).value;
    final jars = savings?.jars ?? const <Jar>[];
    final total = savings?.total ?? 0;
    final active = jars.where((jar) => !jar.isArchived).toList();
    final completed = active.where((jar) => percent(jar) >= 100).length;
    final closest = active.fold<Jar?>(
      null,
      (best, jar) => best == null || percent(jar) > percent(best) ? jar : best,
    );
    final streak = active.fold<int>(
      0,
      (best, jar) => (jar.streak ?? 0) > best ? jar.streak ?? 0 : best,
    );
    final depositCount = active.fold<int>(
      0,
      (count, jar) =>
          count +
          effectiveEntries(jar.entries)
              .where((entry) => entry.direction == directionDeposit)
              .length,
    );
    final months = monthlyDeposits(active);
    final badgeList = badges(active);
    final earnedCount = badgeList.where((badge) => badge.earned).length;

    return ScreenContainer(
      scrollable: true,
      child: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 36),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'INSIGHTS',
              style: TextStyle(
                color: palette.muted,
                fontSize: 10,
                letterSpacing: 1.4,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              'Progress, made\nclear.',
              style: TextStyle(
                color: palette.foreground,
                fontSize: 31,
                height: 36 / 31,
              ),
            ),
            _hero(palette, format, total, active.length),
            const SizedBox(height: 27),
            Text(
              'AT A GLANCE',
              style: TextStyle(
                color: palette.muted,
                fontSize: 10,
                letterSpacing: 1.15,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _Metric(
                    icon: Icons.track_changes,
                    label: 'active jars',
                    value: '${active.length}',
                    palette: palette,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Metric(
                    icon: Icons.emoji_events,
                    label: 'completed',
                    value: '$completed',
                    palette: palette,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _Metric(
                    icon: Icons.local_fire_department,
                    label: 'best streak',
                    value: streak > 0
                        ? '$streak ${streak == 1 ? 'day' : 'days'}'
                        : '—',
                    palette: palette,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Metric(
                    icon: Icons.north,
                    label: 'deposits added',
                    value: '$depositCount',
                    palette: palette,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _closestCard(palette, format, closest),
            const SizedBox(height: 27),
            Text(
              'MONTHLY CONTRIBUTIONS',
              style: TextStyle(
                color: palette.muted,
                fontSize: 10,
                letterSpacing: 1.15,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            _MonthlyChart(months: months, palette: palette, format: format),
            const SizedBox(height: 27),
            Text(
              'BADGES',
              style: TextStyle(
                color: palette.muted,
                fontSize: 10,
                letterSpacing: 1.15,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 10),
            _badgeSummary(palette, badgeList.length, earnedCount),
            const SizedBox(height: 10),
            _badgeGrid(palette, badgeList),
          ],
        ),
      ),
    );
  }

  Widget _hero(
    Palette palette,
    String Function(int) format,
    int total,
    int activeCount,
  ) {
    return Container(
      margin: const EdgeInsets.only(top: 23),
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: const Color(0xFF3B2D24),
        borderRadius: BorderRadius.circular(27),
        boxShadow: const [
          BoxShadow(
            color: Color(0x2E3B2D24),
            blurRadius: 16,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TOTAL SAVED',
                      style: TextStyle(
                        color: Color(0xFFE8D9C8),
                        fontSize: 10,
                        letterSpacing: 1.1,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      format(total),
                      style: const TextStyle(
                        color: Color(0xFFFFFDF9),
                        fontSize: 35,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                width: 41,
                height: 41,
                decoration: BoxDecoration(
                  color: const Color(0x2BFFFDF9),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.auto_graph,
                  size: 23,
                  color: Color(0xFFFFFDF9),
                ),
              ),
            ],
          ),
          const SizedBox(height: 15),
          Container(
            padding: const EdgeInsets.only(top: 14),
            decoration: const BoxDecoration(
              border: Border(
                top: BorderSide(color: Color(0x38FFFDF9), width: 0.5),
              ),
            ),
            child: Text(
              activeCount > 0
                  ? '$activeCount active ${activeCount == 1 ? 'jar' : 'jars'}, with every small deposit made visible.'
                  : 'Your progress will take shape as you begin saving.',
              style: const TextStyle(
                color: Color(0xFFE8D9C8),
                fontSize: 13,
                height: 19 / 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _closestCard(
    Palette palette,
    String Function(int) format,
    Jar? closest,
  ) {
    if (closest == null) {
      return Container(
        constraints: const BoxConstraints(minHeight: 83),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: palette.border),
        ),
        child: Row(
          children: [
            Container(
              width: 39,
              height: 39,
              decoration: BoxDecoration(
                color: hexAlpha(toRrggbb(palette.primary), '12'),
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(
                Icons.lightbulb_outlined,
                size: 19,
                color: palette.primary,
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Your progress starts small.',
                    style: TextStyle(
                      color: palette.foreground,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Create a jar, then let your next contribution be the first visible step.',
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 11,
                      height: 16 / 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    final accent = accentFor(closest.accent, palette);
    final progress = percent(closest);
    return Container(
      constraints: const BoxConstraints(minHeight: 83),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Container(
            width: 39,
            height: 39,
            decoration: BoxDecoration(
              color: hexAlpha(accent, '20'),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(Icons.flag, size: 19, color: parseHex(accent)),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'CLOSEST GOAL',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 9,
                    letterSpacing: 1,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  closest.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${format(closest.target - closest.balance > 0 ? closest.target - closest.balance : 0)} to goal',
                  style: TextStyle(color: palette.muted, fontSize: 11),
                ),
                const SizedBox(height: 8),
                Container(
                  height: 5,
                  decoration: BoxDecoration(
                    color: palette.border,
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: progress / 100,
                      child: Container(
                        decoration: BoxDecoration(
                          color: parseHex(accent),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 11),
          Text(
            '$progress%',
            style: TextStyle(
              color: palette.foreground,
              fontSize: 20,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }

  Widget _badgeSummary(Palette palette, int total, int earned) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: Row(
        children: [
          Container(
            constraints: const BoxConstraints(minWidth: 58, minHeight: 58),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(29),
              border: Border.all(color: palette.primary, width: 3),
            ),
            alignment: Alignment.center,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$earned',
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 19,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                Text(
                  'of $total',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  earned == 0
                      ? 'Your first badge is close.'
                      : earned == total
                      ? 'Every badge earned.'
                      : earned >= total / 2
                      ? 'More than halfway.'
                      : 'Just getting started.',
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Milestones you reach simply by saving, one deposit at a time.',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 11,
                    height: 15 / 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _badgeGrid(Palette palette, List<Badge> badgeList) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const gap = 10.0;
        final tileWidth = (constraints.maxWidth - gap) / 2;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final badge in badgeList)
              SizedBox(
                width: tileWidth,
                child: _BadgeCard(badge: badge, palette: palette),
              ),
          ],
        );
      },
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.icon,
    required this.label,
    required this.value,
    required this.palette,
  });

  final IconData icon;
  final String label;
  final String value;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 112),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: hexAlpha(toRrggbb(palette.primary), '12'),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 18, color: palette.primary),
          ),
          const SizedBox(height: 11),
          Text(
            value,
            style: TextStyle(
              color: palette.foreground,
              fontSize: 22,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: 3),
          Text(label, style: TextStyle(color: palette.muted, fontSize: 11)),
        ],
      ),
    );
  }
}

class _MonthlyChart extends StatelessWidget {
  const _MonthlyChart({
    required this.months,
    required this.palette,
    required this.format,
  });

  final List<MonthTotal> months;
  final Palette palette;
  final String Function(int) format;

  @override
  Widget build(BuildContext context) {
    final peak = months.fold<int>(
      1,
      (best, m) => m.total > best ? m.total : best,
    );
    final any = months.any((m) => m.total > 0);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: any
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final month in months)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _Column(
                        month: month,
                        peak: peak,
                        palette: palette,
                        format: format,
                      ),
                    ),
                  ),
              ],
            )
          : Padding(
              padding: const EdgeInsets.symmetric(vertical: 22),
              child: Text(
                'Deposits you make will fill these months in.',
                textAlign: TextAlign.center,
                style: TextStyle(color: palette.muted, fontSize: 12),
              ),
            ),
    );
  }
}

class _Column extends StatelessWidget {
  const _Column({
    required this.month,
    required this.peak,
    required this.palette,
    required this.format,
  });

  final MonthTotal month;
  final int peak;
  final Palette palette;
  final String Function(int) format;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Text(
          month.total > 0 ? format(month.total) : '',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: palette.muted,
            fontSize: 9,
            fontWeight: FontWeight.w700,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: double.infinity,
          height: month.total > 0
              ? (month.total / peak) * 90 < 6
                    ? 6
                    : (month.total / peak) * 90
              : 0,
          decoration: BoxDecoration(
            color: month.total > 0 ? palette.primary : palette.border,
            borderRadius: BorderRadius.circular(6),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          month.label,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: palette.muted,
            fontSize: 10,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _BadgeCard extends StatelessWidget {
  const _BadgeCard({required this.badge, required this.palette});

  final Badge badge;
  final Palette palette;

  @override
  Widget build(BuildContext context) {
    final progress = badge.target > 0
        ? ((badge.value / badge.target) * 100).round().clamp(0, 100)
        : 0;
    return Semantics(
      label: badge.earned
          ? '${badge.name}, earned. ${badge.description}.'
          : '${badge.name}, locked. ${badge.description}. '
                '${badge.value > badge.target ? badge.target : badge.value} of ${badge.target}.',
      child: Container(
        constraints: const BoxConstraints(minHeight: 128),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: palette.surface,
          borderRadius: BorderRadius.circular(19),
          border: Border.all(
            color: badge.earned
                ? hexAlpha(toRrggbb(palette.success), '66')
                : palette.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: badge.earned
                    ? hexAlpha(toRrggbb(palette.warning), '24')
                    : palette.border,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                badge.earned ? badge.glyph : '🔒',
                style: const TextStyle(fontSize: 17),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              badge.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: badge.earned ? palette.foreground : palette.muted,
                fontSize: 12.5,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              badge.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: palette.muted,
                fontSize: 10.5,
                height: 14 / 10.5,
              ),
            ),
            const SizedBox(height: 9),
            if (badge.earned)
              Wrap(
                spacing: 3,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Icon(Icons.check, size: 12, color: palette.success),
                  Text(
                    'Earned',
                    style: TextStyle(
                      color: palette.foreground,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              )
            else
              Container(
                height: 4,
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
                        color: palette.muted,
                        borderRadius: BorderRadius.circular(999),
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
