import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kibbi_company/api.dart';
import 'package:kibbi_company/main.dart';

class FixtureApi extends CompanyApi {
  @override
  Future<void> loginWithAccessCode(String code) async {}
  @override
  Future<Json> request(String path, {String method = 'GET', Json? body}) async {
    if (path == '/api/internal/organizations') {
      return {
        'organizations': [
          {'id': 'fixture', 'name': 'Test company', 'role': 'ceo'},
        ],
      };
    }
    if (path.contains('/dashboard')) {
      return {
        'organization': {'name': 'Test company', 'status': 'active'},
        'asOf': '2026-10-29',
        'range': {
          'from': '2026-10-29',
          'to': '2026-10-29',
          'timezone': 'Africa/Kampala',
        },
        'ranked': [],
        'collected': 0,
        'expectedToday': 100,
        'recognizedToday': 0,
        'coveragePercent': 0,
        'paceGap': -100,
        'periodTotals': {
          'expected': 100,
          'recognized': 0,
          'coveragePercent': 0,
        },
        'registered': {'weekly': 0, 'total': 0, 'call_in': 0},
      };
    }
    if (path.endsWith('/inbox')) {
      return {'people': [], 'viewerId': 'fixture-owner'};
    }
    if (path.endsWith('/settings')) {
      return {
        'company': {
          'name': 'Test company',
          'status': 'active',
          'timezone': 'Africa/Kampala',
          'manager_seat_limit': 0,
          'custom_plan': null,
        },
        'plans': [],
        'role': 'ceo',
      };
    }
    if (path.endsWith('/staff')) {
      return {
        'staff': [
          {
            'user_id': 'fixture-owner',
            'role': 'ceo',
            'status': 'approved',
            'display_name': 'Test owner',
            'email': 'owner@example.test',
          },
        ],
        'canManage': true,
      };
    }
    if (path.endsWith('/audit')) return {'audit': []};
    return {};
  }
}

class AuditedFixtureApi extends FixtureApi {
  final paths = <String>[];
  @override
  Future<Json> request(String path, {String method = 'GET', Json? body}) async {
    paths.add(path);
    if (path.endsWith('/inbox')) {
      return {
        'viewerId': 'fixture-owner',
        'people': [
          {
            'id': 'fixture-admin',
            'name': 'Fixture admin',
            'role': 'kibbiadmin',
            'title': 'Collector',
            'message_count': 0,
          },
        ],
      };
    }
    return super.request(path, method: method, body: body);
  }
}

void main() {
  testWidgets(
    'company owner can navigate real dashboard widgets, custom terms, staff and audit',
    (tester) async {
      tester.view.physicalSize = const Size(1400, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(CompanyApp(api: FixtureApi()));
      await tester.enterText(
        find.widgetWithText(TextField, 'Access code'),
        'fixture-only',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Total cash collected'), findsOneWidget);
      await tester.tap(find.text('Custom plan & settings'));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(FilledButton, 'Customize plan'),
        findsOneWidget,
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Customize plan'));
      await tester.pumpAndSettle();
      expect(find.text('Request custom plan'), findsOneWidget);
      expect(find.text('Billing currency (UGX, USD, …)'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Company staff'));
      await tester.pumpAndSettle();
      expect(find.text('Test owner'), findsOneWidget);
      expect(find.text('Invite manager'), findsOneWidget);
      await tester.tap(find.text('Activity log'));
      await tester.pumpAndSettle();
      expect(find.text('Company activity log'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('all company tabs and message panel load scoped endpoints', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = AuditedFixtureApi();
    await tester.pumpWidget(CompanyApp(api: api));
    await tester.enterText(
      find.widgetWithText(TextField, 'Access code'),
      'fixture-only',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    for (final entry in {
      'Admin approvals': '/requests',
      'Trash': '/trash',
      'Company staff': '/staff',
      'Custom plan & settings': '/settings',
      'Activity log': '/audit',
      'Overview': '/dashboard',
    }.entries) {
      await tester.tap(find.widgetWithText(ListTile, entry.key));
      await tester.pumpAndSettle();
      expect(
        api.paths.last,
        '/api/internal/organizations/fixture${entry.value}',
      );
      expect(tester.takeException(), isNull);
    }
    await tester.tap(find.text('Messages 0'));
    await tester.pumpAndSettle();
    expect(find.text('Messages'), findsOneWidget);
    await tester.tap(find.text('Fixture admin'));
    await tester.pumpAndSettle();
    expect(
      api.paths.last,
      '/api/internal/organizations/fixture/messages?peer=fixture-admin',
    );
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Log out'));
    await tester.pumpAndSettle();
    expect(find.text('Access code'), findsOneWidget);
    expect(find.text('Total cash collected'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
}
