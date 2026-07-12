// ============================================================
// KIBBISAVE — Groups page (Open | Private swipe panels)
// ============================================================
(function () {
  var err = document.getElementById('g-error');
  var track = document.getElementById('panels-track');
  var viewport = document.getElementById('panels-viewport');
  var swipeHint = document.getElementById('swipe-hint');
  var activePanel = 0;

  function showErr(m) {
    if (!err) return;
    err.textContent = m || '';
    err.style.display = m ? 'block' : 'none';
  }
  function fmtUGX(n) { return 'UGX ' + (Number(n) || 0).toLocaleString('en-US'); }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function leadChip(lead) {
    lead = Number(lead) || 0;
    return '<span class="gc-lead ' + (lead >= 0 ? 'ahead' : 'behind') + '">' +
      (lead >= 0 ? '▲ ' : '▼ ') + (lead > 0 ? '+' : '') + lead.toFixed(2) + '%</span>';
  }
  function prog(pct, label) {
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    return '<div class="gc-prog-row"><span class="gc-prog-lbl">' + esc(label) + '</span>' +
      '<span class="gc-prog-pct">' + pct + '%</span></div>' +
      '<div class="gc-prog-wrap"><div class="gc-prog" style="width:' + pct + '%"></div></div>';
  }

  function setPanel(index, opts) {
    opts = opts || {};
    activePanel = index === 1 ? 1 : 0;
    var tabsBar = document.getElementById('side-tabs');
    if (tabsBar) tabsBar.setAttribute('data-active', String(activePanel));
    if (track) {
      track.classList.remove('is-dragging');
      track.style.width = '200%';
      track.style.display = 'flex';
      if (opts.instant) {
        track.style.transition = 'none';
        track.style.transform = 'translateX(' + (activePanel * -50) + '%)';
        // force reflow then restore transition
        void track.offsetWidth;
        track.style.transition = '';
      } else {
        track.style.transition = '';
        track.style.transform = 'translateX(' + (activePanel * -50) + '%)';
      }
    }
    document.querySelectorAll('.side-tab').forEach(function (tab) {
      var on = Number(tab.getAttribute('data-panel')) === activePanel;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (swipeHint) {
      swipeHint.innerHTML = activePanel === 0
        ? '<span>Swipe for Private</span><span class="arrow">››</span>'
        : '<span class="arrow">‹‹</span><span>Swipe for Open</span>';
    }
    if (!opts.skipHash) {
      try {
        var url = new URL(window.location.href);
        if (activePanel === 1) url.searchParams.set('tab', 'private');
        else url.searchParams.delete('tab');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (e) {}
    }
  }

  function joinBtn(href) {
    return '<a class="gc-join" href="' + esc(href) + '">Join this group</a>';
  }

  function privateCard(g) {
    var id = g.group_id || g.id;
    var href = 'kibbisave_my_group_detail_v2.html?id=' + encodeURIComponent(id);
    return '<div class="group-card" data-href="' + esc(href) + '">' +
      '<div class="gc-top"><div class="gc-info">' +
        '<div class="gc-name">' + esc(g.group_name || g.name || g.group_code || 'Unnamed group') + '</div>' +
        '<div class="gc-sub">' + (g.current_members || 1) + '/' + (g.max_members || 7) + ' members · ' +
          (g.period_months || '—') + ' months</div>' +
        '<span class="gc-badge private">Private</span>' +
      '</div><div class="gc-right">' +
        '<div class="gc-val">' + fmtUGX(g.total_deposited) + '</div><div class="gc-val-sub">my savings</div>' +
      '</div></div>' +
      prog(g.target_pct, 'Goal: ' + fmtUGX(g.goal_amount)) +
      '<div class="gc-foot"><span class="gc-dates">Started ' + fmtDate(g.starts_at) +
        ' · <span class="closes">Closes ' + fmtDate(g.closes_at) + '</span></span>' +
      leadChip(g.avg_lead) + '</div>' +
      joinBtn(href) + '</div>';
  }

  function openCard(g) {
    var startLabel = fmtDate(g.created_at || g.starts_at);
    var closesLabel = fmtDate(g.closes_at);
    var href = 'kibbisave_my_group_detail_v2.html?id=' + encodeURIComponent(g.id) + '&open=1';
    return '<div class="group-card" data-href="' + esc(href) + '">' +
      '<div class="gc-top"><div class="gc-info">' +
        '<div class="gc-name">' + esc(g.name || (g.period_months + ' month group')) + '</div>' +
        '<div class="gc-sub">' + g.period_months + ' months · closes at ' + (g.max_members || 7) + ' members</div>' +
        (!g.name
          ? '<span class="gc-badge">First to join names it</span>'
          : '<span class="gc-badge">Open — anyone can join</span>') +
      '</div><div class="gc-right">' +
        '<div class="gc-val">' + (g.current_members || 0) + '/' + (g.max_members || 7) + '</div>' +
        '<div class="gc-val-sub">members</div>' +
      '</div></div>' +
      prog(g.target_pct, 'Group total: ' + fmtUGX(g.total_saved)) +
      '<div class="gc-foot"><span class="gc-dates">' +
        'Start ' + esc(startLabel) +
        ' · <span class="closes">Closes ' + esc(closesLabel) + '</span>' +
      '</span>' + leadChip(g.avg_member_lead) + '</div>' +
      joinBtn(href) + '</div>';
  }

  function wireCards(box) {
    if (!box) return;
    box.querySelectorAll('.group-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a.gc-join')) return;
        window.location.href = card.getAttribute('data-href');
      });
    });
  }

  // Tabs
  document.querySelectorAll('.side-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      setPanel(Number(tab.getAttribute('data-panel')));
    });
  });

  // Swipe between panels with live drag follow
  if (viewport) {
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var dragging = false;
    var axis = null;

    function basePct() {
      return activePanel * -50;
    }

    viewport.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      dragging = true;
      axis = null;
    }, { passive: true });

    viewport.addEventListener('touchmove', function (e) {
      if (!dragging || !e.touches || !e.touches.length || !track) return;
      var x = e.touches[0].clientX - startX;
      var y = e.touches[0].clientY - startY;
      if (!axis) {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
        axis = Math.abs(x) > Math.abs(y) ? 'x' : 'y';
        if (axis === 'x') track.classList.add('is-dragging');
      }
      if (axis !== 'x') return;
      dx = x;
      var w = viewport.offsetWidth || 1;
      var pct = basePct() + (dx / w) * 50;
      // Clamp so you can't over-drag past ends much
      if (pct > 8) pct = 8;
      if (pct < -50 - 8) pct = -50 - 8;
      track.style.transform = 'translateX(' + pct + '%)';
    }, { passive: true });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (track) track.classList.remove('is-dragging');
      var w = viewport.offsetWidth || 1;
      if (axis === 'x' && Math.abs(dx) > w * 0.18) {
        if (dx < 0) setPanel(1);
        else setPanel(0);
      } else {
        setPanel(activePanel);
      }
      dx = 0;
      axis = null;
    }
    viewport.addEventListener('touchend', endDrag);
    viewport.addEventListener('touchcancel', endDrag);
  }

  // Deep-link ?tab=private
  try {
    var initTab = new URLSearchParams(window.location.search).get('tab');
    if (initTab === 'private') setPanel(1, { skipHash: true, instant: true });
    else setPanel(0, { skipHash: true, instant: true });
  } catch (e) {
    setPanel(0, { skipHash: true, instant: true });
  }

  function showOpenFooter(show) {
    var illus = document.getElementById('open-groups-footer-illus');
    var cta = document.getElementById('open-groups-footer-cta');
    if (illus) illus.hidden = !show;
    if (cta) cta.hidden = !show;
  }

  fetch('/api/home', { credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) {
        showErr(d.error);
        showOpenFooter(true);
        return;
      }

      var privBox = document.getElementById('private-groups');
      var privateMine = d.my_private_groups || (d.my_groups || []).filter(function (g) {
        return g.is_private;
      });
      if (d.authenticated) {
        if (privateMine.length) {
          privBox.innerHTML = privateMine.map(privateCard).join('');
          wireCards(privBox);
        } else {
          privBox.innerHTML = '<div class="empty"><img class="kb-illus" src="/assets/illustrations/svg/04-no-groups-empty.svg" alt="Character peeking into an empty jar" width="180" height="180" decoding="async"><div>No private groups yet. Create one above or join with a code.</div></div>';
        }
      } else {
        privBox.innerHTML =
          '<div class="empty">Sign in to manage private groups, or use Join with code after login.</div>';
      }

      var openBox = document.getElementById('open-groups');
      var open = (d.open_groups || []).slice().sort(function (a, b) {
        return (Number(b.current_members) || 0) - (Number(a.current_members) || 0);
      });
      openBox.innerHTML = open.length
        ? '<div class="open-groups-list">' + open.map(openCard).join('') + '</div>'
        : '<div class="empty"><img class="kb-illus" src="/assets/illustrations/svg/17-no-results-found.svg" alt="Character with a magnifying glass" width="180" height="180" decoding="async"><div>No open groups right now — check back shortly.</div></div>';
      wireCards(openBox);
      showOpenFooter(true);
    })
    .catch(function () {
      showErr('Could not reach the server. Refresh to retry.');
      var openBox = document.getElementById('open-groups');
      if (openBox) {
        openBox.innerHTML =
          '<div class="empty"><img class="kb-illus" src="/assets/illustrations/svg/15-something-went-wrong.svg" alt="Bowing apologetic character" width="180" height="180" decoding="async"><div>Could not load groups. Refresh to retry.</div></div>';
      }
      showOpenFooter(true);
    });
})();
