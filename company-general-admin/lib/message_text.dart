import 'package:flutter/material.dart';

/// Parses the supported toolbar markers as text, never as HTML.
class MessageText extends StatelessWidget {
  final String text;
  const MessageText(this.text, {super.key});
  @override
  Widget build(BuildContext context) {
    final pattern = RegExp(
      r'```([\s\S]*?)```|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|_([^_\n]+)_',
    );
    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final match in pattern.allMatches(text)) {
      spans.add(TextSpan(text: text.substring(cursor, match.start)));
      final group = List.generate(
        5,
        (i) => i + 1,
      ).firstWhere((i) => match.group(i) != null);
      final style = switch (group) {
        1 => const TextStyle(fontFamily: 'monospace'),
        2 => const TextStyle(fontWeight: FontWeight.bold),
        3 => const TextStyle(decoration: TextDecoration.underline),
        4 => const TextStyle(decoration: TextDecoration.lineThrough),
        _ => const TextStyle(fontStyle: FontStyle.italic),
      };
      spans.add(TextSpan(text: match.group(group), style: style));
      cursor = match.end;
    }
    spans.add(TextSpan(text: text.substring(cursor)));
    return Text.rich(TextSpan(children: spans));
  }
}

class ChatBalloonBorder extends ShapeBorder {
  final bool own;
  const ChatBalloonBorder({required this.own});
  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.zero;
  @override
  ShapeBorder scale(double t) => this;
  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) {
    final body = Rect.fromLTRB(
      rect.left + (own ? 0 : 8),
      rect.top,
      rect.right - (own ? 8 : 0),
      rect.bottom,
    );
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(body, const Radius.circular(16)));
    final y = rect.bottom - 18;
    if (own) {
      path.moveTo(body.right - 2, y - 7);
      path.lineTo(rect.right, y + 5);
      path.lineTo(body.right - 2, y + 4);
    } else {
      path.moveTo(body.left + 2, y - 7);
      path.lineTo(body.left + 2, y + 4);
      path.lineTo(rect.left, y + 5);
    }
    return path..close();
  }

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) =>
      getOuterPath(rect, textDirection: textDirection);
  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {}
}
