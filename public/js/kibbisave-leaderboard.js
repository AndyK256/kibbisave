(function () {
  var SHIELD_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.6" aria-hidden="true">' +
    '<path d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5l8-3z"/>' +
    '</svg>';

  var MOVEMENT = {
    up: {
      cls: 'mv-up',
      label: 'Rank up',
      svg:
        '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
        '<path d="M5 2.5L7.5 6H2.5L5 2.5Z" fill="#fff"/>' +
        '</svg>',
    },
    down: {
      cls: 'mv-down',
      label: 'Rank down',
      svg:
        '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
        '<path d="M5 7.5L2.5 4H7.5L5 7.5Z" fill="#fff"/>' +
        '</svg>',
    },
    same: {
      cls: 'mv-same',
      label: 'No change',
      svg:
        '<svg viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
        '<circle cx="5" cy="5" r="2" fill="#fff"/>' +
        '</svg>',
    },
  };

  var ENTRIES = [
    { id: 's1', rank: 1, movement: 'up', team: 'Kampala Hustlers', manager: 'Sarah Nakato', gw: 59, total: 2454000, color: '#1a6e35' },
    { id: 's2', rank: 2, movement: 'up', team: 'Entebbe Builders', manager: 'James Okello', gw: 57, total: 2444000, color: '#7b2d8b' },
    { id: 's3', rank: 3, movement: 'same', team: 'Gulu Circle', manager: 'Grace Auma', gw: 55, total: 2438000, color: '#d4a017' },
    { id: 's4', rank: 4, movement: 'down', team: 'Jinja Builders', manager: 'Peter Mugisha', gw: 54, total: 2421000, color: '#185fa5' },
    { id: 's5', rank: 5, movement: 'down', team: 'Makerere Savers', manager: 'Diana Namukasa', gw: 52, total: 2405000, color: '#c0392b' },
    { id: 's6', rank: 6, movement: 'down', team: 'Mbarara Klass', manager: 'Robert Ssebunya', gw: 51, total: 2389000, color: '#5f5e5a' },
    { id: 's7', rank: 7, movement: 'down', team: 'Ntinda Kings', manager: 'Faith Nalwoga', gw: 50, total: 2372000, color: '#185fa5' },
    { id: 's8', rank: 8, movement: 'down', team: 'Wakiso Giants', manager: 'Henry Tumusiime', gw: 49, total: 2356000, color: '#1a6e35' },
    { id: 's9', rank: 9, movement: 'same', team: 'Kampala Hustlers', manager: 'Lydia Kabugo', gw: 48, total: 2340000, color: '#00008b' },
    { id: 's10', rank: 10, movement: 'up', team: 'Entebbe Builders', manager: 'Moses Wasswa', gw: 47, total: 2325000, color: '#7b2d8b' },
    { id: 's11', rank: 11, movement: 'down', team: 'Gulu Circle', manager: 'Ruth Nambi', gw: 46, total: 2310000, color: '#d4a017' },
    { id: 's12', rank: 12, movement: 'same', team: 'Jinja Builders', manager: 'Daniel Kato', gw: 45, total: 2295000, color: '#185fa5' },
    { id: 'me', rank: 47, movement: 'down', team: 'Makerere Savers', manager: 'You', gw: 38, total: 890000, color: '#ffd700', isMe: true },
  ];

  var currentUser = null;
  var activeFilter = 'overall';

  function initials(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (w) {
        return w[0];
      })
      .join('')
      .toUpperCase() || '?';
  }

  function formatTotal(amount) {
    return (Number(amount) || 0).toLocaleString('en-UG');
  }

  function movementHtml(movement) {
    var m = MOVEMENT[movement] || MOVEMENT.same;
    return (
      '<span class="lb-mv ' +
      m.cls +
      '" aria-label="' +
      m.label +
      '">' +
      m.svg +
      '</span>'
    );
  }

  function badgeHtml(entry) {
    if (entry.picture) {
      return (
        '<span class="lb-badge"><img src="' +
        escapeAttr(entry.picture) +
        '" alt=""' +
        (String(entry.picture).startsWith('data:') ? '' : ' referrerpolicy="no-referrer"') +
        '></span>'
      );
    }
    if (entry.isMe && entry.color) {
      return (
        '<span class="lb-badge" style="background:' +
        entry.color +
        ';color:#00008b;font-size:10px;font-weight:600;">' +
        initials(entry.manager) +
        '</span>'
      );
    }
    return '<span class="lb-badge">' + SHIELD_SVG + '</span>';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/'/g, '&#39;');
  }

  function applyCurrentUser(entry) {
    if (!currentUser || !entry.isMe) return entry;
    return {
      id: 'me',
      rank: entry.rank,
      movement: entry.movement,
      team: entry.team,
      manager: currentUser.name || entry.manager,
      gw: entry.gw,
      total: entry.total,
      color: entry.color,
      picture: currentUser.picture || null,
      isMe: true,
    };
  }

  function getVisibleEntries() {
    var list = ENTRIES.map(applyCurrentUser);

    if (activeFilter === 'my-groups') {
      if (!currentUser) return [];
      return list.filter(function (e) {
        return e.isMe || e.team === 'Makerere Savers' || e.team === 'Kampala Hustlers';
      });
    }

    if (!currentUser) {
      return list.filter(function (e) {
        return !e.isMe;
      });
    }

    return list;
  }

  function renderRow(entry) {
    var tr = document.createElement('tr');
    tr.className = 'lb-row' + (entry.isMe ? ' is-me' : '');
    tr.innerHTML =
      '<td class="col-rank">' +
      '<div class="lb-rank-cell">' +
      '<span class="lb-rank-num">' +
      entry.rank +
      '</span>' +
      movementHtml(entry.movement) +
      '</div></td>' +
      '<td class="col-team">' +
      '<div class="lb-team-cell">' +
      badgeHtml(entry) +
      '<div class="lb-team-text">' +
      '<div class="lb-team-name">' +
      escapeHtml(entry.team) +
      (entry.isMe ? '<span class="lb-you-pill">You</span>' : '') +
      '</div>' +
      '<div class="lb-manager-name">' +
      escapeHtml(entry.manager) +
      '</div>' +
      '</div></div></td>' +
      '<td class="col-gw">' +
      entry.gw +
      '</td>' +
      '<td class="col-total">' +
      formatTotal(entry.total) +
      '</td>';
    return tr;
  }

  function renderTable() {
    var tbody = document.getElementById('lb-tbody');
    var empty = document.getElementById('lb-empty');
    var scroll = document.querySelector('.lb-table-scroll');
    if (!tbody) return;

    var entries = getVisibleEntries();
    tbody.innerHTML = '';

    if (!entries.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent =
          activeFilter === 'my-groups' && !currentUser
            ? 'Sign in to see your groups on the leaderboard.'
            : 'No savers match this filter.';
      }
      if (scroll) scroll.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (scroll) scroll.hidden = false;

    entries.forEach(function (entry) {
      tbody.appendChild(renderRow(entry));
    });

    var meRow = tbody.querySelector('.lb-row.is-me');
    if (meRow) {
      meRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function setUpdated() {
    var el = document.getElementById('lb-updated');
    if (!el) return;
    var now = new Date();
    el.textContent =
      'Last updated: ' +
      now.toLocaleString('en-UG', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }) +
      ' (local time)';
  }

  function wireControls() {
    var filter = document.getElementById('lb-filter');
    var reset = document.getElementById('lb-reset');

    if (filter) {
      filter.addEventListener('change', function () {
        activeFilter = filter.value;
        renderTable();
      });
    }

    if (reset) {
      reset.addEventListener('click', function () {
        activeFilter = 'overall';
        if (filter) filter.value = 'overall';
        renderTable();
        setUpdated();
      });
    }
  }

  function loadAuth() {
    return fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        currentUser = data.authenticated ? data.user : null;
      })
      .catch(function () {
        currentUser = null;
      });
  }

  function init() {
    wireControls();
    setUpdated();
    loadAuth().then(renderTable);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
