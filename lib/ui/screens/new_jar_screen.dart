/// New-jar wizard: three guided steps with a live vessel preview — a moment,
/// not a form. Recurring deposits are introduced after the jar exists.
///
/// Port of `app/jar/new.tsx` + `components/new-jar.styles.ts`.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/hex_color.dart';
import '../../core/theme/jar_accents.dart';
import '../../core/theme/palette.dart';
import '../../data/settings_repository.dart' show supportedCurrencies;
import '../../domain/domain.dart';
import '../../services/haptics.dart';
import '../../state/providers.dart';
import '../../state/savings_controller.dart';
import '../widgets/jar_vessel.dart';
import '../widgets/screen_container.dart';

const List<String> _accents = [
  'coral',
  'amber',
  'mint',
  'ocean',
  'berry',
  'clay',
];
const List<String> _icons = [
  'flight',
  'favorite',
  'laptop_mac',
  'home',
  'restaurant',
  'celebration',
];

const Map<String, IconData> _wizardIcons = {
  'flight': Icons.flight,
  'favorite': Icons.favorite,
  'laptop_mac': Icons.laptop_mac,
  'home': Icons.home,
  'restaurant': Icons.restaurant,
  'celebration': Icons.celebration,
};

class NewJarScreen extends ConsumerStatefulWidget {
  const NewJarScreen({super.key});

  @override
  ConsumerState<NewJarScreen> createState() => _NewJarScreenState();
}

class _NewJarScreenState extends ConsumerState<NewJarScreen> {
  int _step = 1;
  String _name = '';
  String _target = '';
  String _accent = 'ocean';
  String _icon = 'flight';
  String _kind = kindGoal;
  String _deadline = '';

  @override
  Widget build(BuildContext context) {
    final palette = ref.watch(paletteProvider);
    final settings = ref.watch(settingsProvider).value;
    final currency = settings?.currency ?? 'USD';
    final format = ref.watch(moneyFormatterProvider);
    final targetValue = toMinor(_target);
    final currencySymbol =
        supportedCurrencies
            .where((item) => item.code == currency)
            .firstOrNull
            ?.symbol ??
        currency;
    final accentHex = parseHex(accentFor(_accent, palette));
    final stepValid = _step == 1
        ? _name.trim().isNotEmpty
        : _step < 3 || (targetValue != null && targetValue > 0);

    void goBack() {
      if (_step == 1) {
        context.pop();
        return;
      }
      Haptics.tap();
      setState(() => _step -= 1);
    }

    void next() {
      if (!stepValid) return;
      Haptics.tap();
      if (_step < 3) {
        setState(() => _step += 1);
        return;
      }
      final id = ref
          .read(savingsProvider.notifier)
          .addJar(
            JarInput(
              name: _name.trim(),
              target: targetValue!,
              accent: _accent,
              icon: _icon,
              kind: _kind,
              deadline: _deadline.trim().isEmpty ? null : _deadline.trim(),
              streak: _kind == kindHabit ? 0 : null,
            ),
          );
      context.replace('/jar/$id');
    }

    final previewName = _name.trim().isEmpty ? 'A goal to grow' : _name.trim();

    return ScreenContainer(
      child: SingleChildScrollView(
        padding: const EdgeInsets.only(bottom: 38),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                _Pressable(
                  onTap: goBack,
                  semantics: _step == 1 ? 'Go back' : 'Previous step',
                  child: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      border: Border.all(color: palette.border),
                      borderRadius: BorderRadius.circular(15),
                      color: palette.surface,
                    ),
                    child: Icon(
                      Icons.arrow_back,
                      color: palette.foreground,
                      size: 20,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  'NEW JAR',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 10,
                    letterSpacing: 1.35,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
                Row(
                  children: [
                    for (final dot in [1, 2, 3])
                      Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.only(left: 5),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: dot <= _step ? accentHex : palette.border,
                        ),
                      ),
                  ],
                ),
              ],
            ),

            // Live preview
            Container(
              margin: const EdgeInsets.only(top: 20),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: palette.surface,
                borderRadius: BorderRadius.circular(25),
                border: Border.all(color: palette.border),
              ),
              child: Row(
                children: [
                  JarVessel(
                    accent: accentFor(_accent, palette),
                    icon: _icon,
                    progress: 0,
                    size: JarVesselSize.medium,
                    label: '0%',
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'YOUR NEW JAR',
                          style: TextStyle(
                            color: palette.muted,
                            fontWeight: FontWeight.w800,
                            fontSize: 10,
                            letterSpacing: 1.1,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          previewName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.foreground,
                            fontSize: 21,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          targetValue != null && targetValue > 0
                              ? 'Target ${format(targetValue)}'
                              : _kind == kindGoal
                              ? 'Give it somewhere to grow.'
                              : 'Build a saving rhythm.',
                          style: TextStyle(
                            color: palette.muted,
                            fontSize: 12,
                            height: 17 / 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            if (_step == 1) ...[
              _title(palette, 'What are you\nsaving for?'),
              _sub(
                palette,
                'Start with the goal itself. You can shape everything else after.',
              ),
              _label(palette, 'WHAT KIND OF JAR?'),
              Row(
                children: [
                  Expanded(
                    child: _kindCard(
                      palette,
                      kindGoal,
                      Icons.flag,
                      'Goal',
                      'A defined target',
                    ),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: _kindCard(
                      palette,
                      kindHabit,
                      Icons.repeat,
                      'Habit',
                      'Build a rhythm',
                    ),
                  ),
                ],
              ),
              _label(palette, 'NAME YOUR JAR'),
              _textField(
                palette,
                value: _name,
                onChanged: (value) => setState(() => _name = value),
                hint: 'e.g. Japan trip',
                maxLength: 60,
                autofocus: true,
                semantics: 'Jar name',
              ),
            ],

            if (_step == 2) ...[
              _title(palette, 'Give it some\npersonality.'),
              _sub(palette, 'Pick an icon and a colour. This jar is yours.'),
              _label(palette, 'CHOOSE AN ICON'),
              Row(
                children: [
                  for (final candidate in _icons)
                    Expanded(
                      child: _Pressable(
                        onTap: () {
                          Haptics.tap();
                          setState(() => _icon = candidate);
                        },
                        semantics: 'Choose $candidate icon',
                        child: Container(
                          height: 43,
                          margin: EdgeInsets.only(
                            right: candidate == _icons.last ? 0 : 8,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: _icon == candidate
                                  ? accentHex
                                  : palette.border,
                              width: _icon == candidate ? 1.5 : 1,
                            ),
                            color: _icon == candidate
                                ? hexAlpha(toRrggbb(accentHex), '22')
                                : palette.surface,
                          ),
                          child: Icon(
                            _wizardIcons[candidate] ?? Icons.flag,
                            size: 21,
                            color: _icon == candidate
                                ? accentHex
                                : palette.muted,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              _label(palette, 'CHOOSE A JAR COLOUR'),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final candidate in _accents)
                    _Pressable(
                      onTap: () {
                        Haptics.tap();
                        setState(() => _accent = candidate);
                      },
                      semantics: 'Choose $candidate jar color',
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: parseHex(jarAccent[candidate]!),
                          borderRadius: BorderRadius.circular(15),
                          border: _accent == candidate
                              ? Border.all(color: palette.surface, width: 3)
                              : null,
                          boxShadow: _accent == candidate
                              ? const [
                                  BoxShadow(
                                    color: Color(0x334A3324),
                                    blurRadius: 5,
                                    offset: Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                        child: _accent == candidate
                            ? const Icon(
                                Icons.check,
                                color: Color(0xFFFFFDF9),
                                size: 18,
                              )
                            : null,
                      ),
                    ),
                ],
              ),
            ],

            if (_step == 3) ...[
              _title(palette, 'Set its target.'),
              _sub(
                palette,
                'The jar fills toward this amount. A deadline is optional.',
              ),
              _label(palette, 'SET A TARGET'),
              Container(
                margin: const EdgeInsets.only(top: 9),
                constraints: const BoxConstraints(minHeight: 62),
                padding: const EdgeInsets.symmetric(horizontal: 16),
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
                        fontSize: 24,
                        fontFamily: 'Georgia',
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _WizardAmountField(
                        palette: palette,
                        value: _target,
                        onChanged: (value) => setState(() => _target = value),
                      ),
                    ),
                  ],
                ),
              ),
              if (!stepValid)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Enter a target greater than zero.',
                    style: TextStyle(color: palette.error, fontSize: 12),
                  ),
                ),
              _label(palette, 'DEADLINE   OPTIONAL'),
              Container(
                margin: const EdgeInsets.only(top: 9),
                constraints: const BoxConstraints(minHeight: 52),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: palette.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: palette.border),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today, size: 18, color: palette.muted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        onChanged: (value) => setState(() => _deadline = value),
                        controller: TextEditingController(text: _deadline)
                          ..selection = TextSelection.collapsed(
                            offset: _deadline.length,
                          ),
                        maxLength: 40,
                        decoration: InputDecoration(
                          hintText: 'e.g. December 2026',
                          hintStyle: TextStyle(
                            color: palette.muted,
                            fontSize: 14,
                          ),
                          border: InputBorder.none,
                          counterText: '',
                          isDense: true,
                        ),
                        style: TextStyle(
                          color: palette.foreground,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 18),
                child: Text(
                  'Saving Jar records your progress. It never moves your money.',
                  style: TextStyle(
                    color: palette.muted,
                    fontSize: 11,
                    height: 16 / 11,
                  ),
                ),
              ),
            ],

            // Continue / create
            Opacity(
              opacity: stepValid ? 1 : 0.45,
              child: _Pressable(
                onTap: stepValid ? next : () {},
                semantics: _step == 3 ? 'Create my jar' : 'Continue',
                child: Container(
                  margin: const EdgeInsets.only(top: 26),
                  constraints: const BoxConstraints(minHeight: 54),
                  decoration: BoxDecoration(
                    color: palette.primary,
                    borderRadius: BorderRadius.circular(17),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        _step == 3 ? 'Create my jar' : 'Continue',
                        style: const TextStyle(
                          color: Color(0xFFFFFDF9),
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        _step == 3 ? Icons.arrow_forward : Icons.arrow_downward,
                        color: const Color(0xFFFFFDF9),
                        size: 19,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _kindCard(
    Palette palette,
    String value,
    IconData icon,
    String title,
    String note,
  ) {
    final active = _kind == value;
    return _Pressable(
      onTap: () {
        Haptics.tap();
        setState(() => _kind = value);
      },
      semantics: '$value jar',
      child: Container(
        constraints: const BoxConstraints(minHeight: 67),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: active ? palette.primary : palette.border),
          color: active ? palette.primary : palette.surface,
        ),
        child: Row(
          children: [
            Icon(
              icon,
              size: 18,
              color: active ? const Color(0xFFFFFDF9) : palette.muted,
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: active
                          ? const Color(0xFFFFFDF9)
                          : palette.foreground,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    note,
                    style: TextStyle(
                      color: active ? const Color(0xFFE8D9C8) : palette.muted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _title(Palette palette, String text) => Padding(
    padding: const EdgeInsets.only(top: 23),
    child: Text(
      text,
      style: TextStyle(
        color: palette.foreground,
        fontSize: 29,
        height: 34 / 29,
      ),
    ),
  );

  Widget _sub(Palette palette, String text) => Padding(
    padding: const EdgeInsets.only(top: 9),
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 310),
      child: Text(
        text,
        style: TextStyle(color: palette.muted, fontSize: 13, height: 19 / 13),
      ),
    ),
  );

  Widget _label(Palette palette, String text) => Padding(
    padding: const EdgeInsets.only(top: 25),
    child: Text(
      text,
      style: TextStyle(
        color: palette.muted,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.05,
        fontSize: 10,
      ),
    ),
  );

  Widget _textField(
    Palette palette, {
    required String value,
    required ValueChanged<String> onChanged,
    required String hint,
    required String semantics,
    int? maxLength,
    bool autofocus = false,
  }) {
    return Container(
      margin: const EdgeInsets.only(top: 9),
      constraints: const BoxConstraints(minHeight: 54),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: palette.border),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 15),
      child: Center(
        child: Semantics(
          label: semantics,
          child: TextField(
            autofocus: autofocus,
            onChanged: onChanged,
            maxLength: maxLength,
            controller: TextEditingController(text: value)
              ..selection = TextSelection.collapsed(offset: value.length),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: TextStyle(color: palette.muted, fontSize: 15),
              border: InputBorder.none,
              counterText: '',
              isDense: true,
            ),
            style: TextStyle(color: palette.foreground, fontSize: 16),
          ),
        ),
      ),
    );
  }
}

class _WizardAmountField extends StatefulWidget {
  const _WizardAmountField({
    required this.palette,
    required this.value,
    required this.onChanged,
  });

  final Palette palette;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  State<_WizardAmountField> createState() => _WizardAmountFieldState();
}

class _WizardAmountFieldState extends State<_WizardAmountField> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.value,
  );

  @override
  void didUpdateWidget(_WizardAmountField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value && _controller.text != widget.value) {
      _controller
        ..text = widget.value
        ..selection = TextSelection.collapsed(offset: widget.value.length);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      autofocus: true,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [_SanitizingFormatter()],
      onChanged: widget.onChanged,
      decoration: InputDecoration(
        hintText: '0',
        hintStyle: TextStyle(color: widget.palette.muted),
        border: InputBorder.none,
        isDense: true,
      ),
      style: TextStyle(
        color: widget.palette.foreground,
        fontSize: 26,
        fontFamily: 'Georgia',
      ),
    );
  }
}

class _Pressable extends StatefulWidget {
  const _Pressable({required this.child, required this.onTap, this.semantics});

  final Widget child;
  final VoidCallback onTap;
  final String? semantics;

  @override
  State<_Pressable> createState() => _PressableState();
}

class _PressableState extends State<_Pressable> {
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
    );
  }
}

class _SanitizingFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final sanitized = sanitizeAmountInput(newValue.text);
    return TextEditingValue(
      text: sanitized,
      selection: TextSelection.collapsed(offset: sanitized.length),
    );
  }
}
