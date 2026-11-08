/// Shared 38px circular back button for the pushed transfer screens.
library;

import 'package:flutter/material.dart';

import '../../core/theme/palette.dart';

class CircleButton extends StatelessWidget {
  const CircleButton({
    super.key,
    required this.palette,
    required this.icon,
    required this.onTap,
    this.semantics,
  });

  final Palette palette;
  final IconData icon;
  final VoidCallback onTap;
  final String? semantics;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantics,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: palette.surface,
            border: Border.all(color: palette.border),
          ),
          child: Icon(icon, size: 20, color: palette.foreground),
        ),
      ),
    );
  }
}
