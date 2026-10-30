import 'package:flutter/material.dart';
import 'api.dart';

class OwnerDashboard extends StatefulWidget {
  const OwnerDashboard({
    super.key,
    required this.api,
    required this.onLogout,
    this.onCompanyTools,
  });
  final CompanyApi api;
  final Future<void> Function() onLogout;
  final Future<void> Function()? onCompanyTools;
  @override
  State<OwnerDashboard> createState() => _OwnerDashboardState();
}

class _OwnerDashboardState extends State<OwnerDashboard> {
  Json? overview, detail;
  List<Json> items = [];
  String section = 'overview', query = '', period = 'Daily';
  String? error;
  bool busy = true;
  int offset = 0, total = 0, revision = 0;
  DateTimeRange? range;
  final search = TextEditingController();
  static const sections = [
    'overview',
    'admins',
    'clients',
    'companies',
    'communities',
    'groups',
  ];
  static const labels = [
    'Overview',
    'KibbiAdmins',
    'Clients',
    'Companies',
    'Communities',
    'Groups',
  ];
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    revision++;
    search.dispose();
    super.dispose();
  }

  List<Json> list(dynamic v) => (v as List? ?? [])
      .map((e) => Map<String, dynamic>.from(e as Map))
      .toList();
  String money(dynamic n) => 'UGX ${n ?? 0}';
  String fieldLabel(String key) => key
      .replaceAll('_', ' ')
      .split(' ')
      .map(
        (word) =>
            word.isEmpty ? word : word[0].toUpperCase() + word.substring(1),
      )
      .join(' ');
  String date(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String datesQuery() =>
      range == null ? '' : '?from=${date(range!.start)}&to=${date(range!.end)}';
  Future<void> load() async {
    final ticket = ++revision;
    setState(() {
      busy = true;
      error = null;
      detail = null;
    });
    try {
      if (section == 'overview') {
        final data = await widget.api.request(
          '/api/internal/owner/overview${datesQuery()}',
        );
        if (mounted && ticket == revision) setState(() => overview = data);
      } else {
        final data = await widget.api.request(
          '/api/internal/owner/directory/$section?q=${Uri.encodeQueryComponent(query)}&offset=$offset${range == null ? '' : '&from=${date(range!.start)}&to=${date(range!.end)}'}',
        );
        if (mounted && ticket == revision) {
          setState(() {
            items = list(data['items']);
            total = (data['total'] as num).toInt();
          });
        }
      }
    } catch (e) {
      if (mounted && ticket == revision) setState(() => error = e.toString());
    } finally {
      if (mounted && ticket == revision) setState(() => busy = false);
    }
  }

  Future<void> person(String id) async {
    final ticket = ++revision;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final data = await widget.api.request('/api/internal/owner/people/$id');
      if (mounted && ticket == revision) setState(() => detail = data);
    } catch (e) {
      if (mounted && ticket == revision) setState(() => error = e.toString());
    } finally {
      if (mounted && ticket == revision) setState(() => busy = false);
    }
  }

  Future<void> choosePeriod(String value) async {
    final businessToday = DateTime.parse(
      overview?['range']['today'] ?? date(DateTime.now()),
    );
    DateTimeRange? selected;
    if (value == 'Custom') {
      selected = await showDateRangePicker(
        context: context,
        firstDate: businessToday.subtract(const Duration(days: 366)),
        lastDate: businessToday,
        initialDateRange: range,
        helpText: 'Platform reporting dates',
      );
      if (selected == null) return;
    } else if (value == 'Weekly') {
      selected = DateTimeRange(
        start: businessToday.subtract(
          Duration(days: businessToday.weekday - 1),
        ),
        end: businessToday,
      );
    } else if (value == 'Monthly') {
      selected = DateTimeRange(
        start: DateTime(businessToday.year, businessToday.month),
        end: businessToday,
      );
    }
    if (!mounted) return;
    setState(() {
      range = selected;
      period = value;
    });
    await load();
  }

  Widget metric(String title, String value, [String? note]) => SizedBox(
    width: 260,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title),
            const SizedBox(height: 12),
            Text(
              value,
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold),
            ),
            if (note != null)
              Text(note, style: const TextStyle(color: Colors.black54)),
          ],
        ),
      ),
    ),
  );
  Widget overviewBody() {
    final r = overview;
    if (r == null) return const SizedBox();
    final counts = Map<String, dynamic>.from(r['counts'] as Map);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'Platform overview',
          style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
        ),
        Text('${r['range']['from']} to ${r['range']['to']} · Africa/Kampala'),
        const SizedBox(height: 20),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            metric(
              'Confirmed deposits',
              money(r['deposits']),
              'Selected period · counted once',
            ),
            metric(
              'Approved admin collections',
              money(r['collections']),
              'Separate measure; overlaps deposits',
            ),
            metric(
              'Expected in selected period',
              money(r['schedule']?['expected_period']),
              'Current active schedules',
            ),
            metric(
              'Expected today',
              money(r['schedule']?['expected_today']),
              'Africa/Kampala business day',
            ),
            metric(
              'Recognized for today',
              money(r['schedule']?['recognized_today']),
              'Includes advances due today',
            ),
            metric(
              'Deposits in last 24 hours',
              money(r['rolling24h']?['current']),
              'Previous 24 hours: ${money(r['rolling24h']?['previous'])}',
            ),
            metric(
              'New registered accounts',
              '${counts['new_clients']}',
              'Selected period',
            ),
            metric(
              'Current saved total',
              money(r['savings']),
              'Current membership snapshot',
            ),
            for (final key in [
              'clients',
              'admins',
              'companies',
              'communities',
              'groups',
            ])
              metric(
                key == 'clients'
                    ? 'Registered accounts'
                    : key == 'admins'
                    ? 'Enabled KibbiAdmins'
                    : 'Total $key',
                '${counts[key]}',
                'Current platform count',
              ),
          ],
        ),
        const SizedBox(height: 20),
        Text(r['note'] ?? ''),
        const SizedBox(height: 12),
        const Text(
          'Directories show current records. Admin ranking uses current client on-track performance, then approved collections in the selected period. No company membership or financial records are changed from this dashboard.',
        ),
      ],
    );
  }

  Widget directory() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: search,
                  decoration: const InputDecoration(
                    labelText: 'Search name, email or group code',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onSubmitted: (v) {
                    setState(() {
                      query = v;
                      offset = 0;
                    });
                    load();
                  },
                ),
              ),
              const SizedBox(width: 12),
              FilledButton(
                onPressed: busy
                    ? null
                    : () {
                        setState(() {
                          query = search.text;
                          offset = 0;
                        });
                        load();
                      },
                child: const Text('Search'),
              ),
            ],
          ),
        ),
        if (section == 'admins')
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Ranked by current on-track client percentage, then approved collections in the selected period. No due clients = unranked.',
            ),
          ),
        Expanded(
          child: items.isEmpty
              ? const Center(child: Text('No matching records.'))
              : ListView.builder(
                  itemCount: items.length,
                  itemBuilder: (context, i) {
                    final p = items[i];
                    final isPerson =
                        section == 'clients' || section == 'admins';
                    return Card(
                      margin: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 4,
                      ),
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: section == 'admins'
                              ? const Color(0xfffce0ed)
                              : const Color(0xffdcefff),
                          child: Text('${offset + i + 1}'),
                        ),
                        title: Text(p['name'] ?? 'Unnamed'),
                        subtitle: Text(summary(p)),
                        trailing: isPerson
                            ? const Icon(Icons.chevron_right)
                            : null,
                        onTap: busy
                            ? null
                            : () => isPerson
                                  ? person(p['id'] as String)
                                  : showRecord(p),
                      ),
                    );
                  },
                ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                onPressed: busy || offset == 0
                    ? null
                    : () {
                        setState(() => offset -= 50);
                        load();
                      },
                icon: const Icon(Icons.chevron_left),
              ),
              Text(
                total == 0
                    ? '0 records'
                    : '${offset + 1}–${offset + items.length} of $total',
              ),
              IconButton(
                onPressed: busy || offset + 50 >= total
                    ? null
                    : () {
                        setState(() => offset += 50);
                        load();
                      },
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String summary(Json p) {
    switch (section) {
      case 'admins':
        return '${p['clients']} clients · ${p['on_track'] == null ? 'Unranked' : '${num.parse(p['on_track'].toString()).toStringAsFixed(1)}% on track'} · ${money(p['collected'])} collected\nKYC ${p['kyc_complete'] == true ? 'complete' : 'incomplete'} · ${p['disabled_at'] == null ? 'Enabled' : 'Disabled'}';
      case 'clients':
        return '${p['email'] ?? ''} · ${p['memberships']} active memberships · ${money(p['saved'])} saved';
      case 'companies':
        return '${p['owner']} · ${p['status']} · ${p['staff']} approved members';
      case 'communities':
        return '${p['owner'] ?? 'Unassigned'} · ${p['members']} members · ${p['is_public'] == true ? 'Public' : 'Private'}';
      default:
        return '${p['code'] ?? 'No code'} · ${p['status']} · ${p['current_members']} members · ${money(p['total_saved'])} saved';
    }
  }

  Future<void> showRecord(Json p) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(p['name'] ?? 'Details'),
      content: SingleChildScrollView(
        child: SelectionArea(
          child: Text(
            p.entries
                .map((e) => '${fieldLabel(e.key)}: ${e.value ?? '—'}')
                .join('\n'),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    ),
  );
  Widget detailBody() {
    final d = detail!, p = Map<String, dynamic>.from(d['person'] as Map);
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => detail = null),
            icon: const Icon(Icons.arrow_back),
            label: const Text('Back to directory'),
          ),
        ),
        Text(p['name'] ?? 'Person', style: const TextStyle(fontSize: 28)),
        Text('${p['email'] ?? ''}\n${p['phone'] ?? ''}'),
        for (final key in ['companies', 'memberships', 'clients']) ...[
          const SizedBox(height: 20),
          Text(
            key == 'clients'
                ? 'Registered client memberships'
                : key == 'memberships'
                ? 'Savings memberships'
                : 'Company memberships',
            style: const TextStyle(fontSize: 22),
          ),
          if (list(d[key]).isEmpty) const Text('No records.'),
          for (final item in list(d[key]))
            Card(
              child: ListTile(
                title: Text(item['name'] ?? item['code'] ?? 'Unnamed'),
                subtitle: Text(
                  item.entries
                      .where((e) => e.key != 'id' && e.key != 'name')
                      .map((e) => '${fieldLabel(e.key)}: ${e.value ?? '—'}')
                      .join(' · '),
                ),
                onTap: key == 'clients'
                    ? () => person(item['id'] as String)
                    : null,
              ),
            ),
        ],
        const Text(
          'Membership detail lists show up to 100 records per section. Use the searchable directories to locate other people.',
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('KibbiSave · Platform owner'),
      actions: [
        if (section == 'overview' || section == 'admins')
          DropdownButton<String>(
            value: period,
            items: [
              for (final p in ['Daily', 'Weekly', 'Monthly', 'Custom'])
                DropdownMenuItem(value: p, child: Text(p)),
            ],
            onChanged: busy ? null : (v) => choosePeriod(v!),
          ),
        IconButton(
          tooltip: 'Refresh',
          onPressed: busy ? null : load,
          icon: const Icon(Icons.refresh),
        ),
        if (widget.onCompanyTools != null)
          TextButton(
            onPressed: widget.onCompanyTools,
            child: const Text('Company tools'),
          ),
        TextButton(onPressed: widget.onLogout, child: const Text('Log out')),
      ],
    ),
    body: Row(
      children: [
        NavigationRail(
          selectedIndex: sections.indexOf(section),
          extended: MediaQuery.sizeOf(context).width > 900,
          onDestinationSelected: (i) {
            setState(() {
              section = sections[i];
              offset = 0;
              query = '';
              search.clear();
            });
            load();
          },
          destinations: [
            for (var i = 0; i < sections.length; i++)
              NavigationRailDestination(
                icon: Icon(
                  [
                    Icons.dashboard,
                    Icons.badge,
                    Icons.people,
                    Icons.business,
                    Icons.forum,
                    Icons.groups,
                  ][i],
                ),
                label: Text(labels[i]),
              ),
          ],
        ),
        const VerticalDivider(width: 1),
        Expanded(
          child: SelectionArea(
            child: Column(
              children: [
                if (error != null)
                  MaterialBanner(
                    content: Text(error!),
                    actions: [
                      TextButton(
                        onPressed: busy ? null : load,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                if (busy) const LinearProgressIndicator(),
                Expanded(
                  child: busy
                      ? const Center(child: Text('Loading platform data…'))
                      : detail != null
                      ? detailBody()
                      : section == 'overview'
                      ? overviewBody()
                      : directory(),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
