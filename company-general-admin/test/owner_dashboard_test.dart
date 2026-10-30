import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kibbi_company/api.dart';
import 'package:kibbi_company/main.dart';
import 'company_flow_test.dart' show FixtureApi;

class OwnerFixture extends FixtureApi {
  final calls = <String>[];
  bool loggedOut = false;
  @override
  Future<void> loginWithAccessCode(String code) async {}
  @override
  Future<void> logout() async {
    loggedOut = true;
  }

  @override
  Future<Json> request(String path, {String method = 'GET', Json? body}) async {
    calls.add(path);
    if (path == '/api/internal/organizations') {
      return {
        'platformOwner': true,
        'organizations': [
          {'id': 'fixture', 'name': 'Test company', 'role': 'ceo'},
        ],
      };
    }
    if (path.contains('/owner/overview')) {
      return {
        'range': {
          'today': '2026-10-30',
          'from': '2026-10-30',
          'to': '2026-10-30',
        },
        'counts': {
          'clients': 3,
          'admins': 2,
          'companies': 1,
          'communities': 1,
          'groups': 4,
          'new_clients': 1,
        },
        'deposits': '100',
        'collections': '100',
        'savings': '500',
        'note': 'Fixture totals',
      };
    }
    if (path.contains('/owner/people/')) {
      return {
        'person': {
          'id': 'person',
          'name': 'Sample saver',
          'email': 'sample@example.test',
        },
        'companies': [],
        'memberships': [],
        'clients': [],
      };
    }
    if (path.contains('/directory/')) {
      return {
        'items': [
          {
            'id': 'person',
            'name': 'Sample saver',
            'email': 'sample@example.test',
            'clients': 1,
            'on_track': '100',
            'collected': '100',
            'memberships': 1,
            'saved': '500',
            'kyc_complete': true,
            'status': 'active',
            'staff': 1,
            'members': 1,
            'current_members': 1,
            'total_saved': 500,
          },
        ],
        'total': 1,
      };
    }
    return super.request(path, method: method, body: body);
  }
}

void main() {
  testWidgets(
    'owner login routes to global views, search, drilldown, period and logout',
    (tester) async {
      tester.view.physicalSize = const Size(1440, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = OwnerFixture();
      await tester.pumpWidget(CompanyApp(api: api));
      await tester.enterText(
        find.widgetWithText(TextField, 'Access code'),
        'fixture',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('KibbiSave · Platform owner'), findsOneWidget);
      expect(find.text('Confirmed deposits'), findsOneWidget);
      for (final label in [
        'KibbiAdmins',
        'Clients',
        'Companies',
        'Communities',
        'Groups',
      ]) {
        await tester.tap(find.text(label));
        await tester.pumpAndSettle();
        expect(find.text('Sample saver'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
      await tester.tap(find.text('Clients'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'sample');
      await tester.tap(find.widgetWithText(FilledButton, 'Search'));
      await tester.pumpAndSettle();
      expect(api.calls.last, contains('q=sample'));
      await tester.tap(find.text('Sample saver'));
      await tester.pumpAndSettle();
      expect(find.text('Savings memberships'), findsOneWidget);
      await tester.tap(find.text('Back to directory'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Overview'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Daily'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Weekly').last);
      await tester.pumpAndSettle();
      expect(api.calls.last, contains('from=2026-10-26'));
      await tester.tap(find.text('Company tools'));
      await tester.pumpAndSettle();
      expect(find.text('Total cash collected'), findsOneWidget);
      await tester.tap(find.text('Platform overview'));
      await tester.pumpAndSettle();
      expect(find.text('KibbiSave · Platform owner'), findsOneWidget);
      await tester.tap(find.text('Log out'));
      await tester.pumpAndSettle();
      expect(api.loggedOut, true);
      expect(find.text('Access code'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
