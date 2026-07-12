// ============================================================
// KIBBISAVE — HOME PAGE DATA
// Own home: cache + GET /api/home (optional auth).
// Public member home: ?user=<id> or ?u=<id> → GET /api/users/:id/home
//   Social snapshot only — no account number, history, or owner actions.
// Self-view: if ?user= matches the logged-in user → owner mode (full /api/home).
// ============================================================
(function () {
  var CACHE_KEY = 'kibbi_home_cache_v2';
  var params = new URLSearchParams(window.location.search || '');
  var publicUserId = (params.get('user') || params.get('u') || '').trim();
  var isPublicView = Boolean(publicUserId);

  function sameUserId(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function sessionUserId(user) {
    if (!user) return '';
    return String(user.userId || user.id || '').trim();
  }

  // ---------- formatting ----------
  function fmtUGX(n) {
    n = Number(n) || 0;
    return 'UGX ' + n.toLocaleString('en-US');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return '—';
    var datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    var timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return datePart + ', ' + timePart;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function firstName(name) {
    var n = String(name || 'Member').trim();
    return n.split(/\s+/)[0] || 'Member';
  }
  // Show prefix (first 5), mask the rest — e.g. 0750123456 → 07501******
  function maskAccountNumber(raw) {
    var digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 5) return digits.charAt(0) + '*'.repeat(Math.max(0, digits.length - 1));
    return digits.slice(0, 5) + '*'.repeat(Math.max(6, digits.length - 5));
  }
  // Lead % = (deposited/goal)% − (time elapsed/period)%.
  // Expected pace rises ~100% over each group's period, so lead falls at
  // ~100/period_days % per day. Crossover to negative ≈ lead / avg daily burn.
  function estimateDepositDue(data) {
    var s = data.summary || {};
    var lead = Number(s.avg_lead) || 0;
    if (lead <= 0) {
      return { text: 'Already negative — deposit to get ahead', tone: 'now', at: null };
    }

    var groups = data.my_groups || [];
    var burns = [];
    var i;
    for (i = 0; i < groups.length; i++) {
      var g = groups[i];
      var start = new Date(g.starts_at || g.joined_at);
      var end = new Date(g.closes_at || g.ends_at);
      if (isNaN(start) || isNaN(end) || end <= start) continue;
      var periodDays = (end - start) / 86400000;
      if (periodDays > 0) burns.push(100 / periodDays);
    }

    var dailyBurn = 0;
    if (burns.length) {
      dailyBurn = burns.reduce(function (a, b) { return a + b; }, 0) / burns.length;
    } else if (s.next_end_date) {
      // No group periods — rough weekly cadence until next end date
      var untilEnd = (new Date(s.next_end_date) - Date.now()) / 86400000;
      if (untilEnd > 0) dailyBurn = 100 / Math.max(untilEnd, 7);
    }

    if (!(dailyBurn > 0)) {
      return { text: '—', tone: 'muted', at: null };
    }

    var daysLeft = lead / dailyBurn;
    if (!isFinite(daysLeft) || daysLeft <= 0) {
      return { text: 'Already negative — deposit to get ahead', tone: 'now', at: null };
    }

    var msLeft = daysLeft * 86400000;
    var due = new Date(Date.now() + msLeft);

    // Under ~30 minutes: urgency copy (still race-to-negative)
    if (msLeft < 30 * 60 * 1000) {
      return { text: 'Turns negative soon — deposit now', tone: 'now', at: due };
    }

    return {
      text: 'Turns negative on ' + fmtDateTime(due),
      tone: 'soon',
      at: due
    };
  }

  // ---------- public-mode chrome (hide owner-only actions) ----------
  function applyPublicChrome(memberName) {
    document.body.classList.add('is-public-member-home');
    document.title = (memberName || 'Member') + ' — KibbiSave';

    var label = document.querySelector('.home-savings-label');
    if (label) label.textContent = firstName(memberName) + "'s total savings";

    // Never show account number on a public member view
    var acc = document.getElementById('home-acc-no');
    if (acc) {
      acc.hidden = true;
      acc.removeAttribute('aria-hidden');
    }

    // Hide deposit / owner actions — viewers look, they don't act as this member
    document.querySelectorAll(
      '.site-btn-deposit, .nav-deposit-mobile, a[href*="kibbisave_deposit"]'
    ).forEach(function (el) {
      el.style.display = 'none';
    });

    var filterBtn = document.querySelector('.home-filter-btn');
    if (filterBtn) filterBtn.hidden = true;

    var banner = document.getElementById('home-public-banner');
    if (!banner) {
      var panel = document.querySelector('.home-savings-panel');
      if (panel) {
        var slot = panel.closest('.home-card-ambient') || panel;
        banner = document.createElement('div');
        banner.id = 'home-public-banner';
        banner.className = 'home-public-banner';
        banner.setAttribute('role', 'status');
        slot.parentNode.insertBefore(banner, slot);
      }
    }
    if (banner) {
      banner.textContent = 'Public profile · ' + (memberName || 'Member');
    }
  }

  // ---------- hero / summary ----------
  function renderSummary(data) {
    var s = data.summary || {};
    var memberName = (data.user && data.user.display_name) || null;

    var acc = document.getElementById('home-acc-no');
    if (acc) {
      // Owner home only. Public ?user= views never show Acc no (not even empty).
      var masked = (!data.public && data.authenticated && s.account_number)
        ? maskAccountNumber(s.account_number)
        : '';
      if (masked) {
        acc.hidden = false;
        var span = acc.querySelector('span');
        if (span) span.textContent = masked;
      } else {
        acc.hidden = true;
        var clear = acc.querySelector('span');
        if (clear) clear.textContent = '';
      }
    }

    setText('home-total', fmtUGX(s.total_savings));
    setText('home-active-groups',
      s.active_groups > 0
        ? 'Across ' + s.active_groups + ' active group' + (s.active_groups > 1 ? 's' : '')
        : (data.public ? 'No public groups yet' : 'No active groups yet'));
    setText('home-pct-reached', (Number(s.pct_reached) || 0) + '% reached');
    setText('home-goal', 'Goal ' + fmtUGX(s.total_goal));

    var fill = document.getElementById('home-prog-fill');
    if (fill) fill.style.width = Math.max(0, Math.min(100, Number(s.pct_reached) || 0)) + '%';

    var lead = Number(s.avg_lead) || 0;
    var pctEl = document.getElementById('home-lead-pct');
    if (pctEl) {
      pctEl.textContent = (lead > 0 ? '+' : '') + lead.toFixed(2) + '%';
      pctEl.style.color = lead > 0 ? '#1a6e35' : (lead < 0 ? '#c0392b' : '');
      pctEl.classList.remove('is-long', 'is-xl');
    }

    if (data.public) {
      var who = firstName(memberName);
      setText('home-lead-label',
        lead < 0
          ? 'behind ' + who + "'s savings target by"
          : 'ahead of ' + who + "'s savings target by");
    } else {
      setText('home-lead-label',
        lead < 0
          ? 'behind your savings target by'
          : 'ahead of your savings target by');
    }

    var due = estimateDepositDue(data);
    setText('home-deadline', due.text);
    var dueEl = document.querySelector('.chart-deadline');
    if (dueEl) {
      dueEl.classList.toggle('is-due-now', due.tone === 'now');
      dueEl.classList.toggle('is-due-soon', due.tone === 'soon');
    }

    setText('home-groups-count', String(s.active_groups || 0));
    // week_total is owner-only deposit activity — skip on public payloads
    if (!data.public) {
      var week = Number(s.week_total) || 0;
      setText('home-week-total', fmtUGX(week));
      setText('home-week-sub', week > 0 ? 'deposited in the last 7 days' : 'Deposit to get started');
    }
  }

  // ---------- popular communities (GET /api/communities) ----------
  var AV_COLORS = ['#c0392b', '#1a6e35', '#7b2d8b', '#00008b', '#b7791f', '#0e7490'];

  function hashStr(s) {
    var h = 0;
    var str = String(s || '');
    for (var i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
    return Math.abs(h);
  }

  function communityInitials(name) {
    var parts = String(name || 'C').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'C';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  function popularAvatarHtml(c) {
    var members = Number(c.total_members) || 0;
    var seed = hashStr(c.id || c.name);
    var count = Math.min(3, Math.max(1, members || 1));
    var html = '<div class="home-popular-avatars">';
    for (var i = 0; i < count; i++) {
      var color = AV_COLORS[(seed + i) % AV_COLORS.length];
      var label = i === 0 ? communityInitials(c.name) : String.fromCharCode(65 + ((seed + i * 3) % 26));
      html += '<div class="home-popular-av" style="background:' + color + '">' + esc(label) + '</div>';
    }
    if (members > 3) {
      html += '<div class="home-popular-av-more">+' + Math.min(99, members - 3) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function popularCommunityCard(c) {
    var href = 'kibbisave_cause_detail.html?id=' + encodeURIComponent(c.id);
    var members = Number(c.total_members) || 0;
    var icon = c.icon ? (String(c.icon) + ' ') : '';
    var peopleLbl = members === 1 ? '1 person saving' : (members + ' people saving');
    return '' +
      '<article class="home-popular-card" tabindex="0" role="link" data-href="' + esc(href) + '">' +
        '<div class="home-popular-main">' +
          popularAvatarHtml(c) +
          '<div class="home-popular-text">' +
            '<div class="home-popular-name">' + esc(icon + (c.name || 'Community')) + '</div>' +
            '<div class="home-popular-sub">' + esc(peopleLbl) + '</div>' +
          '</div>' +
        '</div>' +
        '<a class="home-popular-explore" href="' + esc(href) + '">Explore</a>' +
      '</article>';
  }

  function bindPopularCardActions(grid) {
    if (!grid) return;
    grid.querySelectorAll('.home-popular-card').forEach(function (card) {
      function go() {
        var href = card.getAttribute('data-href');
        if (href) window.location.href = href;
      }
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        go();
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function renderPopularCommunities(list) {
    var wrap = document.getElementById('home-popular');
    var grid = document.getElementById('home-popular-grid');
    if (!wrap || !grid) return;

    /* Single card: public community with the most members */
    var items = (list || []).slice(0, 1);
    if (!items.length) {
      wrap.hidden = true;
      grid.innerHTML = '';
      return;
    }

    wrap.hidden = false;
    grid.innerHTML = items.map(popularCommunityCard).join('');
    bindPopularCardActions(grid);
  }

  function loadPopularCommunities() {
    fetch('/api/communities', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.error) {
          renderPopularCommunities([]);
          return;
        }
        var list = (data.communities || []).filter(function (c) {
          return c && (c.is_public === true || c.is_public === 1 || c.is_public === 't' || c.is_public === 'true');
        }).slice().sort(function (a, b) {
          var dm = (Number(b.total_members) || 0) - (Number(a.total_members) || 0);
          if (dm) return dm;
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        renderPopularCommunities(list);
      })
      .catch(function () {
        renderPopularCommunities([]);
      });
  }

  // ---------- group cards ----------
  var SLOT_SVG_OPEN = '<svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#1a6e35" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
  var SLOT_SVG_LOW = '<svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#d4a017" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
  var CAL_SVG = '<svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#7a85a0" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  var CLOSE_SVG = '<svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="#c0392b" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  function progressBlock(pct, goalLabel) {
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    return '' +
      '<div class="gc-prog-row">' +
        '<span class="gc-prog-goal-lbl">' + esc(goalLabel) + '</span>' +
        '<span class="gc-prog-pct">' + pct + '%</span>' +
      '</div>' +
      '<div class="gc-prog-wrap"><div class="gc-prog" style="width:' + pct + '%"><span class="gc-prog-dot"></span></div></div>';
  }

  function leadChip(lead) {
    lead = Number(lead) || 0;
    var cls = lead >= 0 ? 'ahead' : 'behind';
    var txt = (lead > 0 ? '+' : '') + lead.toFixed(2) + '% ' + (lead >= 0 ? 'ahead' : 'behind');
    return '<span class="gc-lead ' + cls + '">' + txt + '</span>';
  }

  function normalizeOpenGroup(g) {
    if (g.period_label && g.code) return g;
    var members = Number(g.current_members) || 0;
    var max = Number(g.max_members) || 7;
    var slots = Math.max(0, max - members);
    var deposited = Number(g.total_saved) || 0;
    var target = Number(g.target_amount || g.goal_amount) || 0;
    var pct = Number(g.target_pct);
    if (!isFinite(pct) && target > 0) pct = Math.round((deposited / target) * 100);
    pct = Math.max(0, Math.min(100, pct || 0));
    var months = Number(g.period_months) || 0;
    return {
      id: g.id || g.group_id || g.code || 'open',
      code: g.code || g.group_code || ('#' + (g.id || 'OPEN')),
      period_label: g.period_label || (months ? months + ' Months' : 'Open group'),
      slots: g.slots != null ? g.slots : slots,
      slots_tone: (g.slots_tone || (slots <= 2 ? 'low' : 'open')),
      members: members,
      avatars: g.avatars || [],
      more: g.more != null ? g.more : Math.max(0, members - 3),
      deposited: deposited,
      target: target,
      pct: pct,
      starts_label: g.starts_label || (g.created_at ? fmtDate(g.created_at) : (g.first_member_at || g.starts_at ? fmtDate(g.starts_at) : 'when first member joins')),
      closes_label: g.closes_label || (g.closes_at ? fmtDate(g.closes_at) : '—'),
      href: g.href || ('kibbisave_my_group_detail_v2.html?id=' + encodeURIComponent(g.id || '') + '&open=1')
    };
  }

  function avatarStackHtml(avatars, more) {
    var html = '<div class="av-stack">';
    (avatars || []).slice(0, 3).forEach(function (a) {
      html += '<div class="av-c" style="background:' + esc(a.color || '#00008b') + ';">' + esc(a.initials || '?') + '</div>';
    });
    if (more > 0) html += '<div class="av-more">+' + more + '</div>';
    html += '</div>';
    return html;
  }

  // My / their group card — from user_group_standings
  function myGroupCard(g) {
    var hasUnread = !!(g.has_unread || (Number(g.unread_count) || 0) > 0);
    var detailHref = 'kibbisave_my_group_detail_v2.html?id=' + encodeURIComponent(g.group_id);
    var msgHref = detailHref + '&tab=messages';
    return '' +
      '<article class="group-card-main gc-tappable" tabindex="0" role="link" ' +
        'data-href="' + esc(detailHref) + '">' +
        '<div class="gc-top">' +
          '<div class="gc-info">' +
            '<div class="gc-name">' + esc(g.group_name || g.group_code || 'Unnamed group') + '</div>' +
            '<div class="gc-sub">' + esc(g.saving_for || g.cause_title || 'Savings group') + '</div>' +
            (g.rank_in_group ? '<span class="gc-my-rank blue">Rank #' + g.rank_in_group + ' in group</span>' : '') +
          '</div>' +
          '<div class="gc-right">' +
            '<a class="gc-msg-btn' + (hasUnread ? ' has-unread' : '') + '" href="' + esc(msgHref) + '" ' +
              'aria-label="' + (hasUnread ? 'Unread messages' : 'Group messages') + '" data-msg-link>' +
              '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>' +
                '<polyline points="22,6 12,13 2,6"/>' +
              '</svg>' +
              (hasUnread ? '<span class="gc-msg-dot" aria-hidden="true"></span>' : '') +
            '</a>' +
            '<div class="gc-val">' + fmtUGX(g.total_deposited) + '</div>' +
            '<div class="gc-val-sub">savings</div>' +
          '</div>' +
        '</div>' +
        '<div class="gc-dates">' +
          '<span class="gc-date-chip">Started <span>' + fmtDate(g.starts_at) + '</span></span>' +
          '<span class="gc-date-chip closes">Ends <span>' + fmtDate(g.closes_at) + '</span></span>' +
        '</div>' +
        progressBlock(g.target_pct, 'Goal ' + fmtUGX(g.goal_amount || g.target_amount)) +
        '<div class="gc-foot">' +
          '<span class="gc-sub">' + (g.current_members || 1) + '/' + (g.max_members || 7) + ' members</span>' +
          leadChip(g.avg_lead) +
        '</div>' +
      '</article>';
  }

  function openGroupCard(raw) {
    var g = normalizeOpenGroup(raw);
    var monthsMatch = String(g.period_label || '').match(/(\d+)/);
    var months = monthsMatch ? monthsMatch[1] : '';
    var name = raw.name || raw.group_name || (months ? months + ' month group' : (g.period_label || 'Open group'));
    var max = Number(raw.max_members) || 7;
    var members = Number(g.members) || 0;
    var href = g.href || ('kibbisave_my_group_detail_v2.html?id=' + encodeURIComponent(g.id || '') + '&open=1');
    var startLabel = g.starts_label || '—';
    var closesLabel = g.closes_label || '—';
    return '' +
      '<div class="group-card" data-href="' + esc(href) + '">' +
        '<div class="gc-top"><div class="gc-info">' +
          '<div class="gc-name">' + esc(name) + '</div>' +
          '<div class="gc-sub">' +
            (months ? esc(months) + ' months · ' : '') +
            'closes at ' + max + ' members' +
          '</div>' +
          (!raw.name && !raw.group_name
            ? '<span class="gc-badge">First to join names it</span>'
            : '<span class="gc-badge">Open — anyone can join</span>') +
        '</div><div class="gc-right">' +
          '<div class="gc-val">' + members + '/' + max + '</div>' +
          '<div class="gc-val-sub">members</div>' +
        '</div></div>' +
        progressBlock(g.pct, 'Group total: ' + fmtUGX(g.deposited)) +
        '<div class="gc-foot"><span class="gc-dates">' +
          'Start ' + esc(startLabel) +
          ' · <span class="closes">Closes ' + esc(closesLabel) + '</span>' +
        '</span>' + leadChip(raw.avg_member_lead != null ? raw.avg_member_lead : raw.avg_lead) + '</div>' +
        '<a class="gc-join" href="' + esc(href) + '">Join this group</a>' +
      '</div>';
  }

  function bindGroupCardActions(grid) {
    grid.querySelectorAll('.gc-tappable').forEach(function (card) {
      function go() { window.location.href = card.getAttribute('data-href'); }
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-msg-link]')) return;
        go();
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
    grid.querySelectorAll('.group-card[data-href]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a.gc-join')) return;
        var href = card.getAttribute('data-href');
        if (href) window.location.href = href;
      });
    });
  }

  function setGuestCreateVisible(show) {
    var cta = document.getElementById('home-guest-create');
    if (!cta) return;
    if (show) {
      cta.hidden = false;
      cta.classList.add('is-visible');
    } else {
      cta.hidden = true;
      cta.classList.remove('is-visible');
    }
  }

  function renderGroups(data) {
    var grid = document.getElementById('home-groups-grid');
    var title = document.getElementById('home-groups-title');
    if (!grid) return;

    var mine = (data.my_groups || []);

    if (data.public) {
      if (title) title.textContent = 'Public groups';
      grid.classList.remove('home-groups-grid--open');
      grid.innerHTML = mine.length
        ? mine.map(myGroupCard).join('')
        : '<div class="home-groups-empty"><img class="kb-illus" src="/assets/illustrations/svg/04-no-groups-empty.svg" alt="Character peeking into an empty jar" width="180" height="180" decoding="async"><div>No public groups to show yet.</div></div>';
      bindGroupCardActions(grid);
      setGuestCreateVisible(false);
      return;
    }

    if (data.authenticated && mine.length > 0) {
      if (title) title.textContent = 'My Groups';
      grid.classList.remove('home-groups-grid--open');
      grid.innerHTML = mine.map(myGroupCard).join('');
      setGuestCreateVisible(false);
    } else {
      if (title) title.textContent = 'Open Groups';
      var open = (data.open_groups || []).slice().sort(function (a, b) {
        return (Number(b.current_members) || 0) - (Number(a.current_members) || 0);
      });
      grid.classList.add('home-groups-grid--open');
      grid.innerHTML = open.length
        ? open.map(openGroupCard).join('')
        : '<div class="home-groups-empty"><img class="kb-illus" src="/assets/illustrations/svg/04-no-groups-empty.svg" alt="Character peeking into an empty jar" width="180" height="180" decoding="async"><div>No open groups right now — refresh in a moment.</div></div>';
      // Guest / not-yet-in-a-group: show create CTA under Open Groups
      setGuestCreateVisible(!data.authenticated);
    }

    bindGroupCardActions(grid);
  }

  function render(data) {
    if (!data) return;
    if (data.public && data.user) applyPublicChrome(data.user.display_name);
    renderSummary(data);
    renderGroups(data);
  }

  function showLoadError(msg) {
    var grid = document.getElementById('home-groups-grid');
    if (!grid) return;
    if (grid.querySelector('.kibbi-skel-card') || !grid.children.length) {
      grid.innerHTML = '<div class="home-groups-empty"><img class="kb-illus" src="/assets/illustrations/svg/15-something-went-wrong.svg" alt="Bowing apologetic character" width="180" height="180" decoding="async"><div>' + esc(msg || 'Could not load groups. Refresh to retry.') + '</div></div>';
    }
  }

  // ---------- own home: cache first, then fresh from the API ----------
  function loadOwnerHome(opts) {
    opts = opts || {};
    var skipCache = !!opts.skipCache;
    if (!skipCache) {
      try {
        var cached = localStorage.getItem(CACHE_KEY);
        if (cached) render(JSON.parse(cached));
      } catch (e) {}
    }

    fetch('/api/home', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && !data.error) {
          render(data);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
        } else {
          showLoadError('Could not load groups right now. Refresh to retry.');
        }
      })
      .catch(function () {
        var isFile = window.location.protocol === 'file:';
        showLoadError(isFile
          ? 'This page was opened as a file. Start the backend (npm run dev in kibbisave_foundation/kibbisave) and open http://localhost:3000 instead.'
          : 'Could not reach the server. Start the backend and refresh.');
      });
  }

  function loadPublicMemberHome() {
    applyPublicChrome('Member');
    fetch('/api/users/' + encodeURIComponent(publicUserId) + '/home', { credentials: 'omit' })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.data || res.data.error) {
          showLoadError((res.data && res.data.error) || 'Member not found.');
          setText('home-total', 'UGX 0');
          return;
        }
        render(res.data);
      })
      .catch(function () {
        showLoadError('Could not reach the server. Refresh to retry.');
      });
  }

  function stripUserQuery() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete('user');
      url.searchParams.delete('u');
      var qs = url.searchParams.toString();
      var clean = url.pathname + (qs ? '?' + qs : '') + url.hash;
      window.history.replaceState(null, '', clean);
    } catch (e) {}
  }

  function consumeDepositRefreshFlag() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('deposited')) return false;
      url.searchParams.delete('deposited');
      var qs = url.searchParams.toString();
      window.history.replaceState(null, '', url.pathname + (qs ? '?' + qs : '') + url.hash);
      try {
        localStorage.removeItem('kibbi_home_cache_v1');
        localStorage.removeItem(CACHE_KEY);
      } catch (e) {}
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- refresh cadence ----------
  // Lead decays with clock time; refresh home metrics every 30 minutes.
  // Deposits clear kibbi_home_cache_* and land with ?deposited=1 for an immediate refetch.
  var HOME_REFRESH_MS = 30 * 60 * 1000;
  var refreshOwner = true;

  function refreshHomeMetrics() {
    if (refreshOwner) loadOwnerHome({ skipCache: true });
    else loadPublicMemberHome();
  }

  function startHomeRefresh() {
    try {
      if (window.__kibbiHomeRefreshTimer) clearInterval(window.__kibbiHomeRefreshTimer);
      window.__kibbiHomeRefreshTimer = setInterval(refreshHomeMetrics, HOME_REFRESH_MS);
    } catch (e) {}
  }

  // Returning from deposit (or bfcache) — refetch so ahead→negative updates immediately
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted) refreshHomeMetrics();
  });

  // ---------- boot ----------
  loadPopularCommunities();
  var forceFresh = consumeDepositRefreshFlag();

  if (isPublicView) {
    // If the viewer is the same person as ?user=, show full owner home (not the locked public snapshot).
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (me) {
        var myId = me && me.authenticated ? sessionUserId(me.user) : '';
        if (myId && sameUserId(myId, publicUserId)) {
          stripUserQuery();
          refreshOwner = true;
          loadOwnerHome({ skipCache: forceFresh });
          startHomeRefresh();
          return;
        }
        refreshOwner = false;
        loadPublicMemberHome();
        startHomeRefresh();
      })
      .catch(function () {
        refreshOwner = false;
        loadPublicMemberHome();
        startHomeRefresh();
      });
    return;
  }

  refreshOwner = true;
  loadOwnerHome({ skipCache: forceFresh });
  startHomeRefresh();
})();
