import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'api.dart';
import 'message_text.dart';

const navy = Color(0xff00008b);
const paper = Color(0xfff5f7fc);
const roleColors = <String, Color>{
  'customer': Color(0xffdcefff),
  'kibbiadmin': Color(0xfffce0ed),
  'manager': Color(0xffffead3),
  'ceo': Color(0xffffdcdc),
};
const roleNames = <String, String>{
  'customer': 'Customer',
  'kibbiadmin': 'KibbiAdmin',
  'manager': 'Manager',
  'ceo': 'CEO',
};
String cash(dynamic value) => 'UGX ${value ?? 0}';
String percent(dynamic value) =>
    value == null ? '—' : '${(value as num).toStringAsFixed(1)}%';
List<Json> rows(dynamic value) => (value as List? ?? [])
    .map((e) => Map<String, dynamic>.from(e as Map))
    .toList();
void main() => runApp(const CompanyApp());

class CompanyApp extends StatelessWidget {
  const CompanyApp({super.key, this.api});
  final CompanyApi? api;
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'KibbiSave Company',
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: navy),
      scaffoldBackgroundColor: paper,
      appBarTheme: const AppBarTheme(backgroundColor: paper),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
      cardTheme: const CardThemeData(elevation: 0),
    ),
    home: CompanyDesktop(api: api),
  );
}

class CompanyDesktop extends StatefulWidget {
  const CompanyDesktop({super.key, this.api});
  final CompanyApi? api;
  @override
  State<CompanyDesktop> createState() => _CompanyDesktopState();
}

class _CompanyDesktopState extends State<CompanyDesktop> {
  late final CompanyApi api;
  int authVersion = 0;
  final accessCode = TextEditingController(),
      draft = TextEditingController();
  final stream = ScrollController();
  bool signedIn = false, busy = false, sending = false, drawer = false;
  String? error, organization, viewer, peer, adminId;
  String section = 'overview', period = 'Daily', role = 'all';
  List<Json> companies = [], contacts = [], messages = [], items = [];
  Json? report;
  Json? companySettings;
  bool canManageStaff = false;
  DateTimeRange? range;
  Timer? poll;
  int version = 0;
  @override
  void initState() {
    super.initState();
    api = widget.api ?? CompanyApi();
    poll = Timer.periodic(const Duration(seconds: 15), (_) {
      if (signedIn && drawer && !busy) {
        unawaited(loadInbox());
        if (peer != null) unawaited(loadMessages());
      }
    });
  }

  @override
  void dispose() {
    poll?.cancel();
    api.close();
    accessCode.dispose();
    draft.dispose();
    stream.dispose();
    super.dispose();
  }

  String endpoint(String path) =>
      '/api/internal/organizations/$organization$path';
  void fail(Object e) {
    if (!mounted) return;
    setState(() {
      error = e is ApiException
          ? e.message
          : e is String
          ? e
          : 'Could not connect. Check your connection and retry.';
      if (e is ApiException && e.status == 401) {
        signedIn = false;
        report = null;
        contacts = [];
        messages = [];
      }
    });
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> signIn() async {
    await run(() async {
      await api.loginWithAccessCode(accessCode.text);
      accessCode.clear();
      if (!mounted) return;
      setState(() => signedIn = true);
      await loadCompanies();
    });
  }

  Future<void> logout() async {
    authVersion++;
    version++;
    setState(() {
      signedIn = false;
      report = null;
      contacts = [];
      messages = [];
      companies = [];
      organization = null;
      peer = null;
      error = null;
    });
    draft.clear();
    accessCode.clear();
    await api.logout();
  }

  Future<void> loadCompanies() async {
    final data = await api.request('/api/internal/organizations');
    if (!mounted || !signedIn) return;
    companies = rows(data['organizations']);
    organization = companies.isEmpty ? null : companies.first['id'] as String;
    if (organization != null) {
      await loadOverview();
      await loadInbox();
    }
    if (mounted) setState(() {});
  }

  String date(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  Future<void> loadOverview() async {
    if (organization == null) return;
    final ticket = ++version;
    // Ask the API for its business-day default rather than using the PC's timezone.
    var path = endpoint('/dashboard');
    if (range != null) {
      path += '?from=${date(range!.start)}&to=${date(range!.end)}';
    } else if (period != 'Daily') {
      final current = await api.request(path);
      final today = DateTime.parse(current['asOf'] as String);
      final from = period == 'Weekly'
          ? today.subtract(Duration(days: today.weekday - 1))
          : DateTime(today.year, today.month, 1);
      path += '?from=${date(from)}&to=${date(today)}';
    }
    final data = await api.request(path);
    if (!mounted || ticket != version) return;
    setState(() {
      report = data;
      section = 'overview';
      adminId = null;
    });
  }

  Future<void> loadSection(String value) async {
    setState(() {
      section = value;
      adminId = null;
    });
    await run(() async {
      if (value == 'overview') {
        await loadOverview();
        return;
      }
      final descriptors = <String, List<String>>{
        'approvals': ['/requests', 'requests'],
        'trash': ['/trash', 'admins'],
        'staff': ['/staff', 'staff'],
        'audit': ['/audit', 'audit'],
        'settings': ['/settings', 'plans'],
      };
      final descriptor = descriptors[value]!;
      final data = await api.request(endpoint(descriptor[0]));
      if (mounted) {
        setState(() {
          items = rows(data[descriptor[1]]);
          if (value == 'settings') companySettings = data;
          if (value == 'staff') canManageStaff = data['canManage'] == true;
        });
      }
    });
  }

  Future<void> chooseRange() async {
    final now = report?['asOf'] == null
        ? DateTime.now()
        : DateTime.parse(report!['asOf'] as String);
    final selected = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: now,
      initialDateRange: range,
      helpText: 'Choose reporting dates',
      saveText: 'Apply range',
    );
    if (selected != null) {
      setState(() {
        range = selected;
        period = 'Custom';
      });
      await run(loadOverview);
    }
  }

  Future<bool> confirm(String title, String description) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
          content: Text(description),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm'),
            ),
          ],
        ),
      ) ??
      false;
  Future<void> createCompany() async {
    final name = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Register company'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Company verification is required before admins can select it during registration.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              decoration: const InputDecoration(
                labelText: 'Registered company name',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, name.text.trim()),
            child: const Text('Register'),
          ),
        ],
      ),
    );
    name.dispose();
    if (result == null || result.isEmpty) return;
    await run(() async {
      await api.request(
        '/api/internal/organizations',
        method: 'POST',
        body: {'name': result},
      );
      await loadCompanies();
    });
  }

  Future<void> fullProfile(Json admin) async {
    await run(() async {
      final data = await api.request(
        endpoint('/admins/${admin['id']}/profile'),
      );
      final p = Map<String, dynamic>.from(data['admin'] as Map);
      if (!mounted) return;
      final remove = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(p['display_name'] ?? 'Admin profile'),
          content: SelectionArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final key in ['email', 'phone', 'address', 'title'])
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Text('$key: ${p[key] ?? 'Not provided'}'),
                  ),
                Text(
                  'KYC: ${p['kyc_complete'] == true ? 'Complete' : 'Incomplete'}',
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text(
                'Delete admin',
                style: TextStyle(color: Colors.red),
              ),
            ),
          ],
        ),
      );
      if (remove == true &&
          await confirm(
            'Move admin to trash?',
            'Reassign active clients first. Access is revoked, and the company can restore the admin. Financial history is retained.',
          )) {
        await api.request(
          endpoint('/admins/${admin['id']}'),
          method: 'DELETE',
          body: {'confirmed': true},
        );
        await loadOverview();
      }
    });
  }

  Future<void> changeAdmin(Json admin) async {
    final options = rows(
      report?['ranked'],
    ).where((a) => a['id'] != admin['id']).toList();
    if (options.isEmpty) {
      fail('Approve a replacement company admin first.');
      return;
    }
    final target = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: const Text('Choose approved replacement'),
        children: [
          for (final a in options)
            SimpleDialogOption(
              onPressed: () => Navigator.pop(context, a['id']),
              child: Text(a['name'] ?? 'Admin'),
            ),
        ],
      ),
    );
    if (target == null ||
        !await confirm(
          'Change portfolio admin?',
          'Move this portfolio and pending deposit requests to the selected admin? Historical cash keeps its original collector.',
        )) {
      return;
    }
    await run(() async {
      await api.request(
        endpoint('/admins/${admin['id']}/reassign'),
        method: 'POST',
        body: {'targetAdminId': target, 'confirmed': true},
      );
      await loadOverview();
    });
  }

  Future<void> loadInbox() async {
    if (organization == null) return;
    final current = organization;
    try {
      final data = await api.request(endpoint('/inbox'));
      if (!mounted || current != organization) return;
      setState(() {
        contacts = rows(data['people']);
        viewer = data['viewerId'] as String?;
      });
    } catch (e) {
      fail(e);
    }
  }

  Json? get contact {
    for (final p in contacts) {
      if (p['id'] == peer) return p;
    }
    return null;
  }

  String get conversation =>
      contact?['conversation_path'] as String? ??
      endpoint('/messages?peer=${Uri.encodeComponent(peer!)}');
  Future<void> loadMessages() async {
    if (peer == null) return;
    final current = peer;
    try {
      final data = await api.request(conversation);
      if (!mounted || current != peer) return;
      final follow =
          !stream.hasClients ||
          stream.position.maxScrollExtent - stream.offset < 100;
      setState(() => messages = rows(data['messages']));
      if (follow) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (stream.hasClients) stream.jumpTo(stream.position.maxScrollExtent);
        });
      }
    } catch (e) {
      fail(e);
    }
  }

  Future<void> send() async {
    final body = draft.text.trim();
    if (body.isEmpty || sending || peer == null) return;
    if (body.length > 500) {
      fail('Use at most 500 characters.');
      return;
    }
    setState(() => sending = true);
    try {
      await api.request(conversation, method: 'POST', body: {'body': body});
      draft.clear();
      await loadMessages();
      await loadInbox();
    } catch (e) {
      fail(e);
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  void format(String marker) {
    final value = draft.value;
    final a = value.selection.isValid
            ? value.selection.start
            : value.text.length,
        b = value.selection.isValid ? value.selection.end : value.text.length;
    draft.value = TextEditingValue(
      text: value.text.replaceRange(
        a,
        b,
        '$marker${value.text.substring(a, b)}$marker',
      ),
      selection: TextSelection.collapsed(offset: a + marker.length),
    );
  }

  Widget tile(String title, String value, {Color? color}) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 10),
          SelectableText(
            value,
            style: TextStyle(
              fontSize: 25,
              fontWeight: FontWeight.bold,
              color: color ?? navy,
            ),
          ),
        ],
      ),
    ),
  );
  Widget overview() {
    final r = report;
    if (r == null && busy) {
      return const DashboardSkeleton();
    }
    if (r == null) {
      return const Center(
        child: Text('Select or register your company to begin.'),
      );
    }
    final admins = rows(r['ranked']);
    if (adminId != null) {
      final matches = admins.where((a) => a['id'] == adminId);
      if (matches.isNotEmpty) return adminDetail(matches.first);
    }
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Card(
          color: navy,
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Total cash collected',
                  style: TextStyle(color: Colors.white70),
                ),
                SelectableText(
                  cash(r['collected']),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 42,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '${r['range']['from']} to ${r['range']['to']} · ${r['range']['timezone']}',
                  style: const TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
        ),
        Wrap(
          children: [
            tile(
              'Expected for selected period',
              cash(r['periodTotals']?['expected'] ?? r['expectedToday']),
            ),
            tile(
              'Recognized for period, including advances',
              cash(r['periodTotals']?['recognized'] ?? r['recognizedToday']),
            ),
            tile(
              'Coverage for selected period',
              percent(
                r['periodTotals']?['coveragePercent'] ?? r['coveragePercent'],
              ),
              color: (r['paceGap'] as num? ?? 0) < 0
                  ? Colors.red
                  : Colors.green,
            ),
          ],
        ),
        Wrap(
          children: [
            tile('New clients this week', '${r['registered']['weekly']}'),
            tile('Total registered', '${r['registered']['total']}'),
            tile('Called in this week', '${r['registered']['call_in']}'),
          ],
        ),
        const SizedBox(height: 24),
        const Text(
          'Approved KibbiAdmins',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
        const Text(
          'On track as of the end date, then collections in the selected period.',
        ),
        if (admins.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Approved admins and assigned clients will appear here.',
            ),
          ),
        for (var i = 0; i < admins.length; i++)
          Card(
            child: ListTile(
              leading: CircleAvatar(child: Text('${i + 1}')),
              title: Text(admins[i]['name'] ?? 'Admin'),
              subtitle: Text(
                '${admins[i]['clientCount']} clients · ${percent(admins[i]['onTrackPercent'])} on track',
              ),
              trailing: Text(cash(admins[i]['collected'])),
              onTap: () => setState(() => adminId = admins[i]['id'] as String),
            ),
          ),
      ],
    );
  }

  Widget adminDetail(Json admin) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: () => setState(() => adminId = null),
          icon: const Icon(Icons.arrow_back),
          label: const Text('Admin ranking'),
        ),
      ),
      ListTile(
        leading: CircleAvatar(
          backgroundImage: admin['picture'] != null
              ? NetworkImage(admin['picture'] as String)
              : null,
          child: admin['picture'] == null ? const Icon(Icons.person) : null,
        ),
        title: Text(
          admin['name'] ?? 'Admin',
          style: const TextStyle(fontSize: 26),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${admin['clientCount']} clients'),
            TextButton(
              onPressed: () => fullProfile(admin),
              child: const Text(
                'Full profile',
                style: TextStyle(decoration: TextDecoration.underline),
              ),
            ),
          ],
        ),
        trailing: FilledButton(
          onPressed: busy ? null : () => changeAdmin(admin),
          child: const Text('Change'),
        ),
      ),
      Text(
        '$period · ${report?['range']['from']} to ${report?['range']['to']}',
      ),
      for (final c in rows(admin['clients']))
        Card(
          child: ListTile(
            title: Text(c['name'] ?? 'Client'),
            subtitle: Text('Expected ${cash(c['expectedToDate'])}'),
            trailing: Text(cash(c['allocatedToDate'])),
          ),
        ),
    ],
  );
  Widget actionList() => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      Text(
        section == 'approvals' ? 'Admin approval requests' : 'Trash',
        style: const TextStyle(fontSize: 28),
      ),
      if (items.isEmpty)
        const Padding(padding: EdgeInsets.all(24), child: Text('No entries.')),
      for (final item in items)
        Card(
          child: ListTile(
            title: Text(item['display_name'] ?? 'Admin'),
            subtitle: Text(
              section == 'approvals'
                  ? '${item['email'] ?? ''} · ${item['phone'] ?? ''}\nKYC: ${item['kyc_complete'] == true ? 'Complete' : 'Incomplete'}'
                  : 'Access removed',
            ),
            isThreeLine: section == 'approvals',
            trailing: FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      final approving = section == 'approvals';
                      if (!await confirm(
                        approving
                            ? 'Approve company admin?'
                            : 'Restore company admin?',
                        approving
                            ? 'Approve only a verified person. This grants access to assigned company portfolios.'
                            : 'The admin must sign in again. Portfolios are not automatically reassigned.',
                      )) {
                        return;
                      }
                      await run(() async {
                        await api.request(
                          endpoint(
                            approving
                                ? '/requests/${item['user_id']}/approve'
                                : '/trash/${item['user_id']}/restore',
                          ),
                          method: 'POST',
                          body: {'confirmed': true},
                        );
                        final data = await api.request(
                          endpoint(approving ? '/requests' : '/trash'),
                        );
                        if (mounted) {
                          setState(
                            () => items = rows(
                              data[approving ? 'requests' : 'admins'],
                            ),
                          );
                        }
                      });
                    },
              child: Text(section == 'approvals' ? 'Approve' : 'Restore'),
            ),
          ),
        ),
    ],
  );
  Widget chatPanel() => SizedBox(
    width: 380,
    child: Card(
      margin: const EdgeInsets.fromLTRB(0, 12, 12, 12),
      child: Column(
        children: [
          ListTile(
            title: Text(
              peer == null ? 'Messages' : (contact?['name'] ?? 'Conversation'),
            ),
            leading: peer == null
                ? null
                : IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () => setState(() {
                      peer = null;
                      messages = [];
                    }),
                  ),
            trailing: IconButton(
              icon: const Icon(Icons.close),
              onPressed: () => setState(() => drawer = false),
            ),
          ),
          if (peer == null) ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final value in ['all', ...roleColors.keys])
                    Padding(
                      padding: const EdgeInsets.all(3),
                      child: ChoiceChip(
                        label: Text(value == 'all' ? 'All' : roleNames[value]!),
                        selected: role == value,
                        onSelected: (_) => setState(() => role = value),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                children: [
                  for (final p in contacts.where(
                    (p) =>
                        p['id'] != viewer &&
                        (role == 'all' || p['role'] == role),
                  ))
                    ListTile(
                      leading: CircleAvatar(
                        radius: 7,
                        backgroundColor: roleColors[p['role']] ?? Colors.grey,
                      ),
                      title: Text(
                        p['role'] == 'ceo'
                            ? (p['company_name'] ?? p['name'])
                            : p['name'],
                      ),
                      subtitle: Text(
                        [
                          roleNames[p['role']] ?? 'Community',
                          p['title'],
                          if (p['role'] == 'ceo') p['name'],
                        ].whereType<String>().join(' · '),
                      ),
                      trailing: Text('${p['message_count'] ?? 0}'),
                      onTap: () {
                        setState(() {
                          peer = p['id'] as String;
                          messages = [];
                        });
                        unawaited(loadMessages());
                      },
                    ),
                ],
              ),
            ),
          ] else ...[
            Expanded(
              child: ListView(
                controller: stream,
                padding: const EdgeInsets.all(12),
                children: [
                  for (final m in messages)
                    Align(
                      alignment: (m['from_user_id'] ?? m['user_id']) == viewer
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 290),
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(12),
                        decoration: ShapeDecoration(
                          color: roleColors[m['sender_role']] ?? paper,
                          shape: ChatBalloonBorder(
                            own: (m['from_user_id'] ?? m['user_id']) == viewer,
                          ),
                        ),
                        child: SelectionArea(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                m['sender_role'] == 'ceo'
                                    ? (m['company_name'] ?? m['display_name'])
                                    : m['display_name'] ?? 'Member',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(
                                [
                                  roleNames[m['sender_role']],
                                  m['title'],
                                  if (m['sender_role'] == 'ceo')
                                    m['display_name'],
                                ].whereType<String>().join(' · '),
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: Colors.black54,
                                ),
                              ),
                              MessageText(m['body'] ?? ''),
                              TextButton(
                                onPressed: () => draft.text =
                                    '> ${m['display_name']}: ${m['body']}\n\n${draft.text}',
                                child: const Text('Reply'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Wrap(
              children: [
                for (final entry in {
                  'Bold': '**',
                  'Italic': '_',
                  'Underline': '__',
                  'Strike': '~~',
                  'Code': '```',
                }.entries)
                  TextButton(
                    onPressed: () => format(entry.value),
                    child: Text(entry.key),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Focus(
                      onKeyEvent: (_, event) {
                        if (event is KeyDownEvent &&
                            event.logicalKey == LogicalKeyboardKey.enter &&
                            !HardwareKeyboard.instance.isShiftPressed) {
                          final cursor = draft.selection.isValid
                              ? draft.selection.start
                              : draft.text.length;
                          final inCode = '```'
                              .allMatches(draft.text.substring(0, cursor))
                              .length
                              .isOdd;
                          if (!inCode) {
                            unawaited(send());
                            return KeyEventResult.handled;
                          }
                        }
                        return KeyEventResult.ignored;
                      },
                      child: TextField(
                        controller: draft,
                        minLines: 2,
                        maxLines: 6,
                        maxLength: 500,
                        decoration: const InputDecoration(
                          labelText: 'Message',
                          counterText: '',
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: sending ? null : send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    ),
  );
  Future<void> assistance() async {
    final contact = TextEditingController(),
        email = TextEditingController(),
        note = TextEditingController();
    final body = await showDialog<Json>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request assistance'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Send your contact and email so support can reach you. A response within one hour is a target, not a guarantee. Do not include passwords, PINs or identity numbers.',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: contact,
                decoration: const InputDecoration(labelText: 'Contact number'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: note,
                maxLines: 3,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Problem note (optional)',
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, <String, dynamic>{
              'contact': contact.text.trim(),
              'email': email.text.trim(),
              'note': note.text.trim(),
              'app': 'internal',
            }),
            child: const Text('Send request'),
          ),
        ],
      ),
    );
    contact.dispose();
    email.dispose();
    note.dispose();
    if (body == null) return;
    await run(() async {
      final response = await api.request(
        '/api/support/requests',
        method: 'POST',
        body: body,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Request saved: ${response['reference']}')),
        );
      }
    });
  }

  Future<void> acceptInvitation() async {
    final input = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Accept manager invitation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Accept only an invitation you expect. It grants access to that company as a manager and must match your signed-in email.',
            ),
            const SizedBox(height: 16),
            TextField(
              controller: input,
              decoration: const InputDecoration(labelText: 'Invitation code'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, input.text.trim()),
            child: const Text('Accept manager role'),
          ),
        ],
      ),
    );
    input.dispose();
    if (code == null || code.isEmpty) return;
    await run(() async {
      await api.request(
        '/api/internal/invitations/accept',
        method: 'POST',
        body: {'code': code, 'confirmed': true},
      );
      await loadCompanies();
    });
  }

  Future<void> inviteManager() async {
    final email = TextEditingController(),
        title = TextEditingController(text: 'Manager');
    final body = await showDialog<Json>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Invite company manager'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Only the invited email can accept. The approved custom plan must have a free manager seat.',
              ),
              const SizedBox(height: 16),
              TextField(
                controller: email,
                decoration: const InputDecoration(labelText: 'Manager email'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: title,
                maxLength: 80,
                decoration: const InputDecoration(labelText: 'Job title'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, <String, dynamic>{
              'email': email.text.trim(),
              'title': title.text.trim(),
            }),
            child: const Text('Create invitation'),
          ),
        ],
      ),
    );
    email.dispose();
    title.dispose();
    if (body == null) return;
    await run(() async {
      final response = await api.request(
        endpoint('/invites'),
        method: 'POST',
        body: body,
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Manager invitation ready'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Share this code only with the intended manager. It expires in seven days.',
              ),
              SelectableText(response['invitationCode'] as String),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await Clipboard.setData(
                  ClipboardData(text: response['invitationCode'] as String),
                );
              },
              child: const Text('Copy code'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    });
  }

  Future<void> customizePlan() async {
    final currency = TextEditingController(text: 'UGX'),
        amount = TextEditingController(),
        seats = TextEditingController(text: '2'),
        note = TextEditingController();
    String billing = 'custom';
    final body = await showDialog<Json>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Customize company plan'),
          content: SizedBox(
            width: 440,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Request terms for review. No payment or extra staff access is activated until approval.',
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: currency,
                    maxLength: 3,
                    decoration: const InputDecoration(
                      labelText: 'Billing currency (UGX, USD, …)',
                    ),
                  ),
                  TextField(
                    controller: amount,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Proposed whole amount',
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: billing,
                    decoration: const InputDecoration(
                      labelText: 'Billing period',
                    ),
                    items: [
                      for (final b in [
                        'monthly',
                        'quarterly',
                        'annually',
                        'custom',
                      ])
                        DropdownMenuItem(value: b, child: Text(b)),
                    ],
                    onChanged: (v) => update(() => billing = v!),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: seats,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Manager seats (0–100)',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: note,
                    minLines: 2,
                    maxLines: 5,
                    maxLength: 1000,
                    decoration: const InputDecoration(
                      labelText: 'Custom terms / billing period details',
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, <String, dynamic>{
                'currency': currency.text.trim().toUpperCase(),
                'amount': int.tryParse(amount.text.trim()),
                'billingPeriod': billing,
                'managerSeats': int.tryParse(seats.text.trim()),
                'note': note.text.trim(),
              }),
              child: const Text('Request custom plan'),
            ),
          ],
        ),
      ),
    );
    for (final c in [currency, amount, seats, note]) {
      c.dispose();
    }
    if (body == null) return;
    await run(() async {
      await api.request(endpoint('/plan-request'), method: 'POST', body: body);
      final data = await api.request(endpoint('/settings'));
      if (mounted) setState(() => companySettings = data);
    });
  }

  Future<void> changeTitle() async {
    final input = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Your company title'),
        content: TextField(
          controller: input,
          maxLength: 80,
          decoration: const InputDecoration(
            labelText: 'Title, e.g. CEO, CPA / HR manager',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, input.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    input.dispose();
    if (text == null || text.isEmpty) return;
    await run(() async {
      await api.request(
        endpoint('/title'),
        method: 'POST',
        body: {'title': text},
      );
      await loadInbox();
    });
  }

  Widget staffPage() => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      const Text(
        'Company staff',
        style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
      ),
      if (canManageStaff)
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(
            onPressed: busy ? null : inviteManager,
            icon: const Icon(Icons.person_add),
            label: const Text('Invite manager'),
          ),
        ),
      for (final person in items)
        Card(
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: roleColors[person['role']],
              child: const Icon(Icons.person, color: navy),
            ),
            title: Text(person['display_name'] ?? 'Staff member'),
            subtitle: Text(
              '${person['email']} · ${roleNames[person['role']]} · ${person['title'] ?? ''} · ${person['status']}',
            ),
            trailing:
                canManageStaff &&
                    person['role'] == 'manager' &&
                    person['status'] == 'approved'
                ? TextButton(
                    onPressed: busy
                        ? null
                        : () async {
                            if (!await confirm(
                              'Remove manager access?',
                              'This manager loses company access. Their messages and audit history remain.',
                            )) {
                              return;
                            }
                            await run(() async {
                              await api.request(
                                endpoint('/staff/${person['user_id']}'),
                                method: 'DELETE',
                                body: {'confirmed': true},
                              );
                              final data = await api.request(
                                endpoint('/staff'),
                              );
                              if (mounted) {
                                setState(() => items = rows(data['staff']));
                              }
                            });
                          },
                    child: const Text('Remove'),
                  )
                : null,
          ),
        ),
    ],
  );
  Widget settingsPage() {
    final data = companySettings;
    if (data == null) {
      return const Center(child: Text('Load company settings to continue.'));
    }
    final c = data['company'];
    final current = c['custom_plan'];
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'Custom plan & settings',
          style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
        ),
        Card(
          child: ListTile(
            title: Text(c['name'] ?? 'Company'),
            subtitle: Text(
              'Verification: ${c['status']} · ${c['timezone']}\nApproved manager seats: ${c['manager_seat_limit']}',
            ),
          ),
        ),
        if (c['status'] != 'active')
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
              'Company verification is pending. The operator must verify the business before it enters the admin directory.',
            ),
          ),
        if (current != null)
          Card(
            child: ListTile(
              title: const Text('Approved custom terms'),
              subtitle: Text(
                '${current['currency']} ${current['amount']} · ${current['billingPeriod']} · ${current['managerSeats']} manager seats\n${current['note']}',
              ),
            ),
          ),
        Wrap(
          spacing: 12,
          children: [
            if (data['role'] == 'ceo')
              FilledButton(
                onPressed: busy ? null : customizePlan,
                child: const Text('Customize plan'),
              ),
            OutlinedButton(
              onPressed: busy ? null : changeTitle,
              child: const Text('Edit my title'),
            ),
            OutlinedButton(
              onPressed: busy ? null : assistance,
              child: const Text('Contact support'),
            ),
          ],
        ),
        const SizedBox(height: 24),
        const Text(
          'Plan requests',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
        ),
        for (final plan in rows(data['plans']))
          Card(
            child: ListTile(
              title: Text(
                '${plan['terms']['currency']} ${plan['terms']['amount']} · ${plan['terms']['billingPeriod']}',
              ),
              subtitle: Text(
                '${plan['terms']['managerSeats']} manager seats · ${plan['status']}\n${plan['terms']['note']}',
              ),
            ),
          ),
      ],
    );
  }

  Widget auditPage() => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      const Text(
        'Company activity log',
        style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
      ),
      if (items.isEmpty) const Text('No recorded company actions yet.'),
      for (final entry in items)
        Card(
          child: ListTile(
            title: Text(entry['action'].toString().replaceAll('_', ' ')),
            subtitle: Text(
              '${entry['actor']} · ${entry['created_at']}\n${entry['entity_id'] ?? ''}',
            ),
          ),
        ),
    ],
  );

  Widget login() => Center(
    child: SizedBox(
      width: 420,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'KibbiSave Company',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: navy,
                ),
              ),
              const Text('CEO access only. Enter your company access code.'),
              const SizedBox(height: 24),
              TextField(
                controller: accessCode,
                obscureText: true,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(labelText: 'Access code'),
                onSubmitted: (_) => signIn(),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: busy ? null : signIn,
                child: Text(busy ? 'Signing in…' : 'Sign in'),
              ),
              TextButton(
                onPressed: busy ? null : assistance,
                child: const Text('Need assistance?'),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text(
                    error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    if (!signedIn) {
      return Scaffold(
        body: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: login(),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(report?['organization']['name'] ?? 'KibbiSave Company'),
        actions: [
          DropdownButton<String>(
            value: period,
            items: [
              for (final p in ['Daily', 'Weekly', 'Monthly', 'Custom'])
                DropdownMenuItem(value: p, child: Text(p)),
            ],
            onChanged: busy
                ? null
                : (value) {
                    if (value == 'Custom') {
                      chooseRange();
                    } else {
                      setState(() {
                        period = value!;
                        range = null;
                      });
                      run(loadOverview);
                    }
                  },
          ),
          IconButton(
            tooltip: 'Refresh',
            onPressed: busy
                ? null
                : () {
                    if (section == 'overview') {
                      run(loadOverview);
                    } else {
                      loadSection(section);
                    }
                  },
            icon: const Icon(Icons.refresh),
          ),
          TextButton.icon(
            onPressed: logout,
            icon: const Icon(Icons.logout),
            label: const Text('Log out'),
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: Column(
        children: [
          if (busy) const LinearProgressIndicator(),
          if (error != null)
            MaterialBanner(
              content: Text(error!),
              actions: [
                TextButton(
                  onPressed: () => setState(() => error = null),
                  child: const Text('Dismiss'),
                ),
              ],
            ),
          Expanded(
            child: Row(
              children: [
                SizedBox(
                  width: 220,
                  child: ColoredBox(
                    color: Colors.white,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        const Text(
                          'COMPANY',
                          style: TextStyle(
                            color: navy,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 16),
                        DropdownButtonFormField<String>(
                          initialValue: organization,
                          isExpanded: true,
                          decoration: const InputDecoration(
                            labelText: 'Organization',
                          ),
                          items: [
                            for (final c in companies)
                              DropdownMenuItem(
                                value: c['id'] as String,
                                child: Text(
                                  c['name'],
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                          onChanged: busy
                              ? null
                              : (value) {
                                  setState(() {
                                    organization = value;
                                    peer = null;
                                    report = null;
                                    contacts = [];
                                    messages = [];
                                  });
                                  run(() async {
                                    await loadOverview();
                                    await loadInbox();
                                  });
                                },
                        ),
                        const SizedBox(height: 20),
                        for (final pair in {
                          'overview': 'Overview',
                          'approvals': 'Admin approvals',
                          'trash': 'Trash',
                          'staff': 'Company staff',
                          'settings': 'Custom plan & settings',
                          'audit': 'Activity log',
                        }.entries)
                          ListTile(
                            selected: section == pair.key,
                            title: Text(pair.value),
                            onTap: busy || organization == null
                                ? null
                                : () => loadSection(pair.key),
                          ),
                        TextButton.icon(
                          onPressed: busy ? null : createCompany,
                          icon: const Icon(Icons.add_business),
                          label: const Text('Register company'),
                        ),
                        const Divider(),
                        const Text(
                          'Company data is available only to approved members.',
                        ),
                        if (report != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 20),
                            child: Text(
                              'Received: ${cash(report!['collected'])}\nExpected today: ${cash(report!['expectedToday'])}\nCoverage: ${percent(report!['coveragePercent'])}',
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  child: SelectionArea(
                    child: section == 'overview'
                        ? overview()
                        : section == 'staff'
                        ? staffPage()
                        : section == 'settings'
                        ? settingsPage()
                        : section == 'audit'
                        ? auditPage()
                        : actionList(),
                  ),
                ),
                if (drawer) chatPanel(),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: drawer || organization == null
          ? null
          : FloatingActionButton.extended(
              onPressed: () {
                setState(() => drawer = true);
                unawaited(loadInbox());
              },
              label: Text(
                'Messages ${contacts.fold<int>(0, (sum, p) => sum + ((p['message_count'] as num?)?.toInt() ?? 0))}',
              ),
              icon: const Icon(Icons.chat_bubble_outline),
            ),
    );
  }
}

class DashboardSkeleton extends StatelessWidget {
  const DashboardSkeleton({super.key});
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Loading company dashboard',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Container(
          height: 160,
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.blueGrey.shade100,
            borderRadius: BorderRadius.circular(20),
          ),
        ),
        Row(
          children: List.generate(
            3,
            (_) => Expanded(
              child: Container(
                height: 110,
                margin: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.blueGrey.shade50,
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
        ),
        for (var i = 0; i < 4; i++)
          Container(
            height: 64,
            margin: const EdgeInsets.only(top: 12),
            decoration: BoxDecoration(
              color: Colors.blueGrey.shade50,
              borderRadius: BorderRadius.circular(12),
            ),
          ),
      ],
    ),
  );
}
