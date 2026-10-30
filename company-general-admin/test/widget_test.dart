import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kibbi_company/main.dart';
import 'package:kibbi_company/api.dart';
import 'package:kibbi_company/message_text.dart';

void main() {
  testWidgets('desktop starts signed out and requires a CEO access code', (
    tester,
  ) async {
    await tester.pumpWidget(const CompanyApp());
    expect(find.text('KibbiSave Company'), findsOneWidget);
    expect(find.text('Access code'), findsOneWidget);
    expect(find.text('Sign in with Google'), findsNothing);
    expect(find.text('Email or phone'), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
    expect(find.text('Total cash collected'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('message formatting renders code and treats HTML as text', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: MessageText('**Hello** ```a\nb``` <img src=x>')),
      ),
    );
    final rich = tester
        .widgetList<RichText>(find.byType(RichText))
        .map((w) => w.text.toPlainText())
        .join();
    expect(rich, contains('Hello a\nb <img src=x>'));
    expect(rich, isNot(contains('**Hello**')));
  });
  test('API rejects insecure or credential-bearing origins', () {
    for (final url in [
      'http://kibbisave.com',
      'https://user:secret@kibbisave.com',
      'https://kibbisave.com/other',
    ]) {
      expect(() => CompanyApi(baseUrl: url), throwsArgumentError);
    }
    final api = CompanyApi();
    expect(api.origin.host, 'kibbisave.com');
    api.close();
  });
}
