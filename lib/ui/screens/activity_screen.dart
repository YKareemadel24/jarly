/// Activity: every transaction grouped by day, with jar / direction / date
/// range filters.
///
/// Port of `app/(tabs)/activity.tsx` + `components/activity.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../activity/activity_sections.dart';
import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../domain/domain.dart';
import '../../state/providers.dart';
import '../widgets/jar_vessel.dart';
import '../widgets/screen_container.dart';

class ActivityScreen extends ConsumerStatefulWidget {
  const ActivityScreen({super.key});

  @override
  ConsumerState<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends ConsumerState<ActivityScreen> {
  ActivityFilters _filters = const ActivityFilters();

  bool get _filtered =>
      _filters.jarId != null ||
      (_filters.direction != null && _filters.direction != 'all') ||
      (_filters.range != null && _filters.range != 'all');

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final savings = ref.watch(savingsProvider).value;
    final jars = savings?.jars ?? const <Jar>[];
    final format = ref.watch(moneyFormatterProvider);
    final hasActivity = jars.any((jar) => !jar.isArchived && jar.entries.isNotEmpty);
    final groups = activitySections(jars, DateTime.now(), _filters);

    final rows = <_SectionedRow>[];
    for (final group in groups) {
      rows.add(_SectionedRow.header(group.title));
      for (var index = 0; index < group.data.length; index++) {
        rows.add(_SectionedRow.row(group.data[index], index,
            index == group.data.length - 1, group.data.length));
      }
    }

    return ScreenContainer(
      scrollable: true,
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(0, 4, 0, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('ACTIVITY',
                      style: TextStyle(
                          color: palette.muted,
                          fontSize: 10,
                          letterSpacing: 1.4,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 7),
                  Text('Every move,\ntold simply.',
                      style: TextStyle(
                          color: palette.foreground,
                          fontSize: 31,
                          height: 36 / 31)),
                  const SizedBox(height: 22),
                  _FilterPanel(
                    filters: _filters,
                    jars: jars,
                    filtered: _filtered,
                    palette: palette,
                    onChanged: (next) => setState(() => _filters = next),
                  ),
                ],
              ),
            ),
          ),
          if (groups.isEmpty)
            SliverToBoxAdapter(child: _empty(palette, hasActivity))
          else
            SliverPadding(
              padding: const EdgeInsets.only(top: 2, bottom: 24),
              sliver: SliverList.builder(
                itemCount: rows.length,
                itemBuilder: (context, index) {
                  final item = rows[index];
                  if (item.isHeader) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 22, bottom: 9),
                      child: Text(item.headerTitle!,
                          style: TextStyle(
                              color: palette.muted,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.9)),
                    );
                  }
                  return _GroupCard(
                    row: item.row!,
                    isFirst: item.isFirst,
                    isLast: item.isLast,
                    format: format,
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Widget _empty(Palette palette, bool hasActivity) {
    return Container(
      margin: const EdgeInsets.only(top: 26),
      padding: const EdgeInsets.all(26),
      alignment: Alignment.center,
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
          Text(hasActivity ? 'No matching activity.' : 'No activity yet.',
              style: TextStyle(color: palette.foreground, fontSize: 22)),
          const SizedBox(height: 8),
          Text(
            hasActivity
                ? 'Try another filter or reset to see every move.'
                : 'Your deposits and withdrawals will appear here.',
            textAlign: TextAlign.center,
            style:
                TextStyle(color: palette.muted, fontSize: 13, height: 19 / 13),
          ),
        ],
      ),
    );
  }
}

class _SectionedRow {
  const _SectionedRow.header(this.headerTitle)
      : row = null,
        isFirst = false,
        isLast = false;
  const _SectionedRow.row(this.row, int index, this.isLast, int count)
      : headerTitle = null,
        isFirst = index == 0;

  bool get isHeader => headerTitle != null;

  final String? headerTitle;
  final ActivityRowData? row;
  final bool isFirst;
  final bool isLast;
}

class _FilterPanel extends ConsumerWidget {
  const _FilterPanel({
    required this.filters,
    required this.jars,
    required this.filtered,
    required this.palette,
    required this.onChanged,
  });

  final ActivityFilters filters;
  final List<Jar> jars;
  final bool filtered;
  final Palette palette;
  final ValueChanged<ActivityFilters> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Filter activity',
                  style: TextStyle(
                      color: palette.foreground,
                      fontSize: 15,
                      fontWeight: FontWeight.w800)),
            ),
            PressableChip(
              onTap: filtered ? () => onChanged(const ActivityFilters()) : null,
              semantics: 'Reset activity filters',
              child: Text('Reset',
                  style: TextStyle(
                      color: palette.primary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      fontFamily: null)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text('Jar',
            style: TextStyle(
                color: palette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        // Horizontal jar selector, matching the original's horizontal ScrollView.
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(
            children: [
              _choice(
                label: 'All jars',
                selected: (filters.jarId ?? '').isEmpty,
                onTap: () => onChanged(ActivityFilters(
                    direction: filters.direction, range: filters.range)),
              ),
              for (final jar in jars.where((jar) => !jar.isArchived))
                _choice(
                  label: jar.name,
                  selected: filters.jarId == jar.id,
                  onTap: () => onChanged(ActivityFilters(
                      jarId: jar.id,
                      direction: filters.direction,
                      range: filters.range)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text('Direction',
            style: TextStyle(
                color: palette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (value, label) in const [
              ('all', 'All'),
              ('deposit', 'Deposits'),
              ('withdrawal', 'Withdrawals'),
            ])
              _choice(
                label: label,
                selected: (filters.direction ?? 'all') == value,
                onTap: () => onChanged(ActivityFilters(
                    jarId: filters.jarId,
                    direction: value,
                    range: filters.range)),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Text('Date range',
            style: TextStyle(
                color: palette.muted,
                fontSize: 12,
                fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (value, label) in const [
              ('all', 'All time'),
              ('7days', '7 days'),
              ('30days', '30 days'),
            ])
              _choice(
                label: label,
                selected: (filters.range ?? 'all') == value,
                onTap: () => onChanged(ActivityFilters(
                    jarId: filters.jarId,
                    direction: filters.direction,
                    range: value)),
              ),
          ],
        ),
        const SizedBox(height: 9),
        Text('Date ranges include today. Archived jars stay in Profile.',
            style: TextStyle(color: palette.muted, fontSize: 12, height: 18 / 12)),
      ],
    );
  }

  Widget _choice({
    required String label,
    required bool selected,
    required VoidCallback? onTap,
  }) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(
            color: selected ? hexAlpha(toRrggbb(palette.primary), '16') : palette.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: selected ? palette.primary : palette.border),
          ),
          child: Text(label,
              style: TextStyle(
                  color: selected ? palette.primary : palette.foreground,
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600)),
        ),
      ),
    );
  }
}

/// A reset button that dims when disabled while keeping the chip metrics.
class PressableChip extends StatelessWidget {
  const PressableChip({
    super.key,
    required this.onTap,
    required this.child,
    this.semantics,
  });

  final VoidCallback? onTap;
  final Widget child;
  final String? semantics;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantics,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedOpacity(
          opacity: onTap == null ? 0.4 : 1,
          duration: const Duration(milliseconds: 120),
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            alignment: Alignment.center,
            child: child,
          ),
        ),
      ),
    );
  }
}

class _GroupCard extends ConsumerWidget {
  const _GroupCard({
    required this.row,
    required this.isFirst,
    required this.isLast,
    required this.format,
  });

  final ActivityRowData row;
  final bool isFirst;
  final bool isLast;
  final String Function(int) format;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = ref.watch(paletteProvider);
    final accent = accentFor(row.jar.accent, palette);
    final isDeposit = row.entry.direction == directionDeposit;
    final movement = isDeposit
        ? (row.entry.source == sourceRecurring
            ? 'Scheduled deposit'
            : 'Money added')
        : 'Money withdrawn';
    final title = row.entry.undoOf != null ? 'Undo · $movement' : movement;
    final amountLabel =
        '${isDeposit ? '+' : '−'}${format(row.entry.amount)}';
    final corrected = row.entry.revisions?.isNotEmpty ?? false;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15),
      decoration: BoxDecoration(
        color: palette.surface,
        border: Border(
          left: BorderSide(color: palette.border),
          right: BorderSide(color: palette.border),
          top: isFirst ? BorderSide(color: palette.border) : BorderSide.none,
          bottom: isLast ? BorderSide(color: palette.border) : BorderSide.none,
        ),
        borderRadius: BorderRadius.vertical(
          top: isFirst ? const Radius.circular(21) : Radius.zero,
          bottom: isLast ? const Radius.circular(21) : Radius.zero,
        ),
      ),
      child: Column(
        children: [
          Semantics(
            label:
                '$title ${isDeposit ? 'into' : 'from'} ${row.jar.name}. $amountLabel.${corrected ? ' Corrected.' : ''}',
            child: Container(
              constraints: const BoxConstraints(minHeight: 65),
              padding: const EdgeInsets.symmetric(vertical: 8),
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
                        Text(row.jar.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                color: palette.foreground,
                                fontSize: 14,
                                fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text(
                          '$title${corrected ? ' · Corrected' : ''}'
                          '${row.entry.note != null && row.entry.note!.isNotEmpty ? ' · ${row.entry.note}' : ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              TextStyle(color: palette.muted, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 11),
                  Text(
                    amountLabel,
                    style: TextStyle(
                      color: isDeposit ? parseHex(accent) : palette.error,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (!isLast)
            Container(
              height: 0.5,
              margin: const EdgeInsets.only(left: 50),
              color: palette.border,
            ),
        ],
      ),
    );
  }
}
