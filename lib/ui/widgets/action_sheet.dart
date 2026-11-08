/// A modal list of choices, port of `components/action-sheet.tsx`.
///
/// The original replaced `Alert.alert` (a no-op on React Native Web) with
/// ordinary views so confirmations behave identically on every platform.
library;

import 'package:flutter/material.dart';

import '../../core/theme/palette.dart';
import 'pressable.dart';
import 'sheet_scaffold.dart';

class SheetAction {
  const SheetAction({
    required this.label,
    this.detail,
    this.destructive = false,
    this.icon,
    required this.onPress,
  });

  /// Button label.
  final String label;

  /// Optional second line explaining what the action does.
  final String? detail;

  /// Renders in the error colour.
  final bool destructive;

  /// Icon shown at the left of the row.
  final IconData? icon;
  final VoidCallback onPress;
}

class ActionSheet extends StatelessWidget {
  const ActionSheet({
    super.key,
    required this.visible,
    required this.title,
    this.message = '',
    required this.actions,
    required this.onDismiss,
  });

  final bool visible;
  final String title;
  final String message;

  /// Rendered top to bottom, so put Cancel last.
  final List<SheetAction> actions;
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
          Text(title, style: TextStyle(color: palette.foreground, fontSize: 20)),
          if (message.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(message,
                  style: TextStyle(
                      color: palette.muted, fontSize: 13, height: 19 / 13)),
            ),
          const SizedBox(height: 16),
          for (final action in actions)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Pressable(
                onTap: () {
                  // Close first so a navigation triggered by the action does
                  // not leave the sheet mounted over the next screen.
                  onDismiss();
                  action.onPress();
                },
                semantics: action.label,
                child: Container(
                  constraints: const BoxConstraints(minHeight: 56),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: palette.background,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: palette.border),
                  ),
                  child: Row(
                    children: [
                      if (action.icon != null) ...[
                        Icon(
                          action.icon,
                          size: 19,
                          color: action.destructive
                              ? palette.error
                              : palette.primary,
                        ),
                        const SizedBox(width: 11),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(action.label,
                                style: TextStyle(
                                    color: action.destructive
                                        ? palette.error
                                        : palette.foreground,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800)),
                            if (action.detail != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(action.detail!,
                                    style: TextStyle(
                                        color: palette.muted,
                                        fontSize: 11,
                                        height: 15 / 11)),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
