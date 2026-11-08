/// The signature animated jar graphic: glass silhouette, spring fill,
/// coin-drop deposit effect, etched milestone ticks, and a sealed-lid
/// completion badge.
///
/// Faithful port of `components/jar-vessel.tsx`. The fill animates with the
/// same spring parameters, the coin replays on [coinDropKey] changes, and both
/// honor reduced-motion.
library;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';

import '../../core/hex_color.dart';
import '../../core/jar_icon.dart';

enum JarVesselSize { small, medium, large }

class _VesselMetrics {
  const _VesselMetrics(this.width, this.height, this.icon, this.label);
  final double width;
  final double height;
  final double icon;
  final double label;
}

_VesselMetrics _metricsFor(JarVesselSize size) => switch (size) {
      JarVesselSize.small => const _VesselMetrics(74, 88, 24, 10),
      JarVesselSize.medium => const _VesselMetrics(104, 126, 33, 11),
      JarVesselSize.large => const _VesselMetrics(164, 198, 49, 13),
    };

const List<int> _tickLevels = [25, 50, 75];

class JarVessel extends StatefulWidget {
  const JarVessel({
    super.key,
    required this.accent,
    required this.icon,
    required this.progress,
    this.size = JarVesselSize.medium,
    this.label,
    this.coinDropKey = 0,
  });

  final String accent;
  final String icon;
  final num progress;
  final JarVesselSize size;
  final String? label;

  /// Increment to replay the coin-drop deposit effect.
  final int coinDropKey;

  @override
  State<JarVessel> createState() => _JarVesselState();
}

class _JarVesselState extends State<JarVessel> with TickerProviderStateMixin {
  late AnimationController _fillController;
  late AnimationController _coinController;
  double _fillTarget = 0;

  @override
  void initState() {
    super.initState();
    final metrics = _metricsFor(widget.size);
    _fillTarget = metrics.height * _clampedFill / 100;
    _fillController = AnimationController.unbounded(vsync: this)
      ..value = _fillTarget;
    _coinController = AnimationController(vsync: this, duration: const Duration(milliseconds: 760));
  }

  double get _clampedFill =>
      widget.progress.toDouble().clamp(0, 100).toDouble();

  @override
  void didUpdateWidget(JarVessel oldWidget) {
    super.didUpdateWidget(oldWidget);
    final metrics = _metricsFor(widget.size);
    final target = metrics.height * _clampedFill / 100;
    final reduceMotion =
        MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (oldWidget.progress != widget.progress ||
        oldWidget.size != widget.size) {
      final from = _fillController.value;
      if (reduceMotion) {
        _fillController.value = target;
      } else {
        _fillController
          ..reset()
          ..animateWith(SpringSimulation(
            const SpringDescription(mass: 1, stiffness: 105, damping: 20),
            from,
            target,
            0,
          ));
      }
    }
    if (widget.coinDropKey > oldWidget.coinDropKey &&
        widget.coinDropKey > 0 &&
        !reduceMotion) {
      _coinController.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _fillController.dispose();
    _coinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final metrics = _metricsFor(widget.size);
    final reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final accent = widget.accent;
    final fill = _clampedFill;
    final complete = fill >= 99.5;
    final rendered = jarIconRender(widget.icon);

    Widget coinLayer() {
      return Positioned(
        top: 0,
        left: 0,
        right: 0,
        child: AnimatedBuilder(
          animation: _coinController,
          builder: (context, _) {
            final t = _coinController.value;
            // Fall: -36 -> 30% height over 430ms with easeIn quad; then a
            // spring settle up to 24% (approximated with easeOutBack).
            const fallEnd = 430 / 760;
            final y = t < fallEnd
                ? _lerpEase(-36, metrics.height * 0.3, t / fallEnd,
                    Curves.easeInQuad)
                : _lerpEase(metrics.height * 0.3, metrics.height * 0.24,
                    ((t - fallEnd) / (1 - fallEnd)).clamp(0.0, 1.0),
                    Curves.easeOutBack);
            final opacity = t < 70 / 760
                ? t / (70 / 760)
                : t < 480 / 760
                    ? 1.0
                    : 1.0 - ((t - 480 / 760) / (260 / 760)).clamp(0.0, 1.0);
            final coinSize = metrics.icon * 0.52;
            return Opacity(
              opacity: opacity.clamp(0.0, 1.0),
              child: Transform.translate(
                offset: Offset(0, y),
                child: Center(
                  child: Container(
                    width: coinSize,
                    height: coinSize,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: const Color(0xFFE8BE5F),
                      border: Border.all(
                          color: const Color(0xFFB8860B), width: 1.5),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x334A3324),
                          blurRadius: 3,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      );
    }

    Widget body() {
      return Positioned(
        bottom: 0,
        left: 0,
        child: Container(
          width: metrics.width,
          height: metrics.height,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: hexAlpha(accent, '10'),
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(27),
              topRight: Radius.circular(27),
              bottomLeft: Radius.circular(35),
              bottomRight: Radius.circular(35),
            ),
            border: Border.all(color: hexAlpha(accent, '9B'), width: 1.5),
            boxShadow: const [
              BoxShadow(
                color: Color(0x294A3324),
                blurRadius: 12,
                offset: Offset(0, 9),
              ),
            ],
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // Fill
              AnimatedBuilder(
                animation: _fillController,
                builder: (context, _) {
                  final height = _fillController.value.clamp(0.0, metrics.height);
                  return Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: height,
                    child: Container(
                      decoration: BoxDecoration(
                        color: hexAlpha(accent, 'A8'),
                        borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(24),
                          topRight: Radius.circular(24),
                        ),
                      ),
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned(
                            top: -4,
                            left: -metrics.width * 0.08,
                            right: -metrics.width * 0.08,
                            height: 10,
                            child: Container(
                              decoration: BoxDecoration(
                                color: hexAlpha(accent, 'C9'),
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              // Glow
              Positioned(
                left: metrics.width * 0.12,
                right: metrics.width * 0.12,
                bottom: metrics.height * 0.10,
                height: metrics.height * 0.47,
                child: Container(
                  decoration: BoxDecoration(
                    color: hexAlpha(accent, complete ? '40' : '28'),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              // Reflection
              Positioned(
                top: metrics.height * 0.16,
                left: metrics.width * 0.15,
                width: metrics.width * 0.13,
                height: metrics.height * 0.35,
                child: Transform.rotate(
                  angle: -12 * 3.141592653589793 / 180,
                  child: Container(
                    decoration: BoxDecoration(
                      color: const Color(0x78FFFFFF),
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
              ),
              // Milestone ticks
              for (final level in _tickLevels)
                Positioned(
                  bottom: metrics.height * level / 100,
                  left: metrics.width * 0.58,
                  right: metrics.width * 0.10,
                  child: Row(
                    children: [
                      Expanded(
                        child: Container(
                          height: 1.5,
                          decoration: BoxDecoration(
                            color: const Color(0x432C231D),
                            borderRadius: BorderRadius.circular(1),
                          ),
                        ),
                      ),
                      if (widget.size == JarVesselSize.large) ...[
                        const SizedBox(width: 3),
                        Text(
                          '$level',
                          style: const TextStyle(
                            color: Color(0x7A2C231D),
                            fontSize: 7,
                            fontWeight: FontWeight.w800,
                            fontFamily: null,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              // Icon
              Positioned(
                top: metrics.height * 0.39,
                left: 0,
                right: 0,
                height: 58,
                child: Center(
                  child: SizedBox(
                    width: metrics.icon + 22,
                    height: metrics.icon + 22,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        Positioned.fill(
                          child: ColoredBox(color: const Color(0x4D2C231D)),
                        ),
                        switch (rendered) {
                          JarIconFont(:final icon) => Icon(
                              icon,
                              size: metrics.icon,
                              color: const Color(0xFFFFFDF9),
                            ),
                          JarIconText(:final text) => Text(
                              text,
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: metrics.icon * 0.9,
                                height: 1.15 / 0.9,
                                color: const Color(0xFFFFFDF9),
                                fontFamily: null,
                              ),
                            ),
                        },
                      ],
                    ),
                  ),
                ),
              ),
              // Completion badge
              if (complete)
                Positioned(
                  top: metrics.height * 0.14,
                  right: -6,
                  child: Container(
                    width: switch (widget.size) {
                      JarVesselSize.large => 32.0,
                      JarVesselSize.medium => 27.0,
                      JarVesselSize.small => 23.0,
                    },
                    height: switch (widget.size) {
                      JarVesselSize.large => 32.0,
                      JarVesselSize.medium => 27.0,
                      JarVesselSize.small => 23.0,
                    },
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFFFFFDF9),
                      boxShadow: [
                        BoxShadow(
                          color: Color(0x384A3324),
                          blurRadius: 4,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Icon(
                      Icons.verified,
                      size: switch (widget.size) {
                        JarVesselSize.large => 20.0,
                        JarVesselSize.medium => 17.0,
                        JarVesselSize.small => 14.0,
                      },
                      color: parseHex(accent),
                    ),
                  ),
                ),
              // Label pill
              if (widget.label != null)
                Positioned(
                  bottom: 9,
                  left: metrics.width * 0.06,
                  right: metrics.width * 0.06,
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0x61201B18),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Text(
                        widget.label!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: const Color(0xF5FFFDF9),
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.35,
                          fontSize: metrics.label,
                          fontFamily: null,
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

    final neck = Positioned(
      top: 7,
      left: metrics.width * 0.19,
      child: Container(
        width: metrics.width * 0.62,
        height: 17,
        decoration: BoxDecoration(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(9)),
          border: Border(
            top: BorderSide(color: hexAlpha(accent, 'A8')),
            left: BorderSide(color: hexAlpha(accent, 'A8')),
            right: BorderSide(color: hexAlpha(accent, 'A8')),
          ),
        ),
      ),
    );

    final lid = Positioned(
      top: 0,
      left: complete ? metrics.width * 0.14 : metrics.width * 0.24,
      child: Container(
        width: metrics.width * (complete ? 0.72 : 0.52),
        height: complete ? 11 : 9,
        decoration: BoxDecoration(
          color: hexAlpha(accent, complete ? 'C4' : '75'),
          borderRadius: BorderRadius.circular(complete ? 6 : 5),
        ),
      ),
    );

    return Semantics(
      container: true,
      image: true,
      label: widget.label,
      child: SizedBox(
        width: metrics.width,
        height: metrics.height + 12,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.bottomCenter,
          children: [
            if (!reduceMotion || widget.coinDropKey > 0) coinLayer(),
            neck,
            lid,
            body(),
          ],
        ),
      ),
    );
  }
}

double _lerpEase(double from, double to, double t, Curve curve) =>
    from + (to - from) * curve.transform(t.clamp(0.0, 1.0));
