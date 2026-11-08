/// Pace/projection card: weekly requirement, recent pace, and an estimated
/// finish date when the jar's own history supports one.
///
/// Port of `components/savings-plan.tsx` (whose behavior is specified by the
/// vitest suite's SavingsPlan tests).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../state/providers.dart';

class SavingsPlanCard extends ConsumerWidget {
  const SavingsPlanCard({super.key, required this.jar});

  final Jar jar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    final format = ref.watch(moneyFormatterProvider);
    final now = DateTime.now();
    final projection = paceProjection(jar, now);
    final entries = effectiveEntries(jar.entries);
    const windowMs = 28 * 86400000;
    var recentTotal = 0;
    final depositDays = <String>{};
    for (final entry in entries) {
      if (entry.direction != directionDeposit) continue;
      final at = parseIso(entry.at);
      final ms = at.millisecondsSinceEpoch;
      if (ms >= now.millisecondsSinceEpoch - windowMs &&
          ms <= now.millisecondsSinceEpoch) {
        recentTotal += entry.amount;
        depositDays.add('${at.year}-${at.month}-${at.day}');
      }
    }
    final recentPace = (recentTotal / 4).round();
    final funded = projection.status == paceFunded;
    final undated = projection.status == paceNoDeadline;
    final countdown = deadlineCountdown(jar.deadline, now);
    final overdue = countdown == 'Past deadline';
    final dueSoon =
        countdown == '1 day left' ||
        RegExp(r'^[2-6] days left$').hasMatch(countdown ?? '');
    final estimatedDate =
        depositDays.length >= 2 && projection.projectedDate != null
        ? formatDate(parseIso(projection.projectedDate!))
        : null;

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
          Text(
            'SAVINGS PLAN',
            style: TextStyle(
              color: palette.muted,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.9,
              fontSize: 10,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            funded ? 'Goal funded.' : 'One week at a time.',
            style: TextStyle(color: palette.foreground, fontSize: 19),
          ),
          const SizedBox(height: 6),
          if (funded)
            Text(
              "You have reached this jar's target.",
              style: TextStyle(
                color: palette.muted,
                fontSize: 13,
                height: 19 / 13,
              ),
            )
          else ...[
            if (undated)
              Text(
                'Set a target date to calculate a weekly amount and finish estimate.',
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 13,
                  height: 19 / 13,
                ),
              )
            else if (overdue)
              Text(
                'Your deadline has passed. Choose a new target date to set a weekly amount.',
                style: TextStyle(
                  color: palette.muted,
                  fontSize: 13,
                  height: 19 / 13,
                ),
              )
            else if (countdown == 'Due today' || dueSoon) ...[
              _metric(
                palette,
                dueSoon ? 'Remaining by deadline' : 'Remaining today',
                format(jar.target - jar.balance),
                null,
              ),
            ] else ...[
              _metric(
                palette,
                'Weekly amount to target',
                '${format(projection.requiredPerWeekMinor)} / week',
                null,
              ),
            ],
            const SizedBox(height: 12),
            _metric(
              palette,
              'Recent deposit pace',
              '${format(recentPace)} / week',
              'Deposits over the past 28 days, averaged over four weeks.',
            ),
            const SizedBox(height: 12),
            if (!undated)
              if (estimatedDate != null)
                _metric(
                  palette,
                  'Estimated finish',
                  estimatedDate,
                  'Uses the higher of recent deposits and your recurring schedule. Withdrawals can delay this estimate.',
                )
              else
                Text(
                  depositDays.length >= 2
                      ? 'A finish estimate is unavailable at this pace.'
                      : 'Record deposits on two different days within the past 28 days to estimate a finish.',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 13,
                    height: 19 / 13,
                  ),
                ),
          ],
        ],
      ),
    );
  }

  Widget _metric(Palette palette, String label, String amount, String? hint) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(
            color: palette.muted,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.0,
            fontSize: 10,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          amount,
          style: TextStyle(
            color: palette.foreground,
            fontSize: 21,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (hint != null)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: Text(
              hint,
              style: TextStyle(
                color: palette.muted,
                fontSize: 11,
                height: 15 / 11,
              ),
            ),
          ),
      ],
    );
  }
}
