(function () {
  var AUTH_CACHE_KEY = 'kibbi_auth_v1';
  var DARK_KEY = 'kibbi_dark_mode';

  // Enable iOS/Android safe-area insets for fixed bottom nav
  (function ensureViewportFitCover() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    var content = meta.getAttribute('content') || '';
    if (/viewport-fit\s*=/i.test(content)) return;
    meta.setAttribute('content', content.replace(/\s*$/, '') + ', viewport-fit=cover');
  })();

  function isDarkMode() {
    try {
      return localStorage.getItem(DARK_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function applyDarkMode(on) {
    var enabled = !!on;
    document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', enabled);
    if (document.body) document.body.classList.toggle('dark', enabled);
    try {
      localStorage.setItem(DARK_KEY, enabled ? '1' : '0');
    } catch (e) {}
  }

  // Apply cached theme ASAP (also mirrored by head boot script)
  applyDarkMode(isDarkMode());

  window.KibbiTheme = {
    isDark: isDarkMode,
    setDark: applyDarkMode,
    key: DARK_KEY,
  };

  var toggle = document.querySelector('.site-menu-toggle');
  var nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    function menuIsOpen() {
      return nav.classList.contains('open');
    }

    function setMenuOpen(open) {
      toggle.classList.toggle('open', open);
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    function closeMenu() {
      setMenuOpen(false);
    }

    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'site-nav');
    if (!nav.id) nav.id = 'site-nav';

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenuOpen(!menuIsOpen());
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', function (e) {
      if (!menuIsOpen()) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuIsOpen()) closeMenu();
    });

    // Close More/hamburger when the page scrolls (not when scrolling inside the menu panel)
    function onPageScroll(e) {
      if (!menuIsOpen()) return;
      var t = e && e.target;
      if (t && t !== document && t !== document.documentElement && t !== document.body) {
        if (nav.contains(t)) return;
      }
      closeMenu();
    }
    window.addEventListener('scroll', onPageScroll, { passive: true, capture: true });
    document.addEventListener('scroll', onPageScroll, { passive: true, capture: true });
    var main = document.querySelector('.site-main');
    if (main) main.addEventListener('scroll', onPageScroll, { passive: true });
  }

  window.sendPrompt = function (prompt) {
    var p = String(prompt || '');
    if (/home screen|Go back to home/i.test(p)) {
      window.location.href = 'kibbisave_home_final.html';
    } else if (/Community screen|Trending screen/i.test(p)) {
      window.location.href = 'kibbisave_community_explore.html';
    } else if (/deposit flow|Deposit again/i.test(p)) {
      window.location.href = 'kibbisave_deposit_v2.html';
    } else if (/Leaderboard/i.test(p)) {
      window.location.href = 'kibbisave_leaderboard_v5.html';
    } else if (/profile screen/i.test(p)) {
      window.location.href = 'kibbisave_profile_screen.html';
    } else if (/Groups screen/i.test(p)) {
      window.location.href = 'kibbisave_groups_v6.html';
    } else if (/Create a new group|Create group/i.test(p)) {
      window.location.href = 'kibbisave_create_group_v2.html';
    } else if (/group details|Show me the/i.test(p)) {
      window.location.href = 'kibbisave_cause_detail.html';
    }
  };

  function readAuthCache() {
    try {
      var v = sessionStorage.getItem(AUTH_CACHE_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (e) {}
    return null;
  }

  function writeAuthCache(isAuthed) {
    try {
      sessionStorage.setItem(AUTH_CACHE_KEY, isAuthed ? '1' : '0');
    } catch (e) {}
  }

  function clearAuthCache() {
    try {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
    } catch (e) {}
  }

  // Site-wide legal / help footer at end of page content
  (function initLegalFooter() {
    var pathname = window.location.pathname || '';
    var path = pathname.split('/').pop() || '';
    if (/^login(\.html)?$/i.test(path) || /^signup(\.html)?$/i.test(path)) return;
    if (pathname.indexOf('/legal/') >= 0) return;
    if (!document.querySelector('.site-header') && !document.querySelector('.site-main')) return;

    var links = [
      { href: '/legal/deposit.html', label: 'Deposit' },
      { href: '/legal/rules.html', label: 'Rules' },
      { href: '/legal/help.html', label: 'Help' },
      { href: '/legal/privacy.html', label: 'Privacy Policy' },
      { href: '/legal/cookies.html', label: 'Cookies Policy' },
      { href: '/legal/responsible-saving.html', label: 'Responsible Saving' },
      { href: '/legal/about.html', label: 'About' },
      { href: '/legal/terms.html', label: 'Terms' },
      { href: '/legal/news.html', label: 'News' },
    ];

    var linksHtml = links
      .map(function (l) {
        return '<li><a href="' + l.href + '">' + l.label + '</a></li>';
      })
      .join('');

    var html =
      '<div class="kb-legal-footer-inner">' +
      '<p class="kb-legal-tagline">Kibbisave-group savings for Uganda</p>' +
      '<ul class="kb-legal-links">' +
      linksHtml +
      '</ul>' +
      '<div class="kb-legal-cautions">' +
      '<p><strong>Cautions:</strong> Group saving involves trust among members. Money you contribute may be locked until a cycle ends, and outcomes depend on members keeping their commitments. KibbiSave is not a bank and does not provide a deposit guarantee. Do not save money you cannot afford to lock for the group period.</p>' +
      '<p>Past group performance does not guarantee future results. Always read your group rules before joining or depositing.</p>' +
      '</div>' +
      '<div class="kb-legal-citations">' +
      '<p><strong>Informational citations (Uganda):</strong> This product is designed with awareness of themes in the Financial Institutions Act (Cap. 57) and Bank of Uganda consumer-protection guidance for payment and savings-related services; the Data Protection and Privacy Act, 2019; and Anti-Money Laundering Act requirements for customer due diligence. These references are educational only and do not mean KibbiSave is a licensed bank, deposit-taking institution, or that any regulator has endorsed this app.</p>' +
      '</div>' +
      '<p class="kb-legal-license">License No: Pending — to be updated</p>' +
      '</div>';

    var footer = document.querySelector('footer.site-footer');
    if (!footer) {
      footer = document.createElement('footer');
      var mainEl = document.querySelector('.site-main');
      if (mainEl && mainEl.parentNode) {
        mainEl.parentNode.insertBefore(footer, mainEl.nextSibling);
      } else {
        document.body.appendChild(footer);
      }
    }
    footer.className = 'site-footer kb-legal-footer';
    footer.innerHTML = html;
  })();

  function authNodes() {
    var seen = [];
    var nodes = document.querySelectorAll(
      '[data-auth-link], .site-auth-pair, .site-auth-btn, .nav-sign-in-mobile, .nav-auth-mobile'
    );
    for (var i = 0; i < nodes.length; i++) {
      if (seen.indexOf(nodes[i]) === -1) seen.push(nodes[i]);
    }
    return seen;
  }

  function ensureAuthPair(container) {
    if (!container) return;
    if (container.classList.contains('site-auth-pair') || container.classList.contains('nav-auth-mobile')) {
      return;
    }
    // Upgrade legacy single link into JOIN NOW + LOGIN pair
    if (container.matches('a.site-auth-btn, a.nav-sign-in-mobile, a[data-auth-link]')) {
      var wrap = document.createElement('div');
      wrap.className = container.classList.contains('nav-sign-in-mobile')
        ? 'nav-auth-mobile'
        : 'site-auth-pair';
      wrap.setAttribute('data-auth-link', '');
      wrap.innerHTML =
        '<a href="/login?tab=join" class="site-btn-join">JOIN NOW</a>' +
        '<a href="/login?tab=login" class="site-btn-login">LOGIN</a>';
      container.replaceWith(wrap);
    }
  }

  function stripBalancePills() {
    var sel =
      '.site-balance, .site-wallet, .wallet-pill, .balance-pill, .header-balance, [data-balance-pill]';
    document.querySelectorAll(sel).forEach(function (el) {
      el.remove();
    });
    // Replace any header control whose label is a UGX balance with Deposit
    document.querySelectorAll('.site-header-actions a, .site-header-actions button, .site-nav a, .site-nav button').forEach(function (el) {
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^UGX\s*[\d,]+(\.\d+)?$/i.test(t) || /UGX\s*0(\.0+)?/i.test(t) && /eye|balance|wallet/i.test(el.className || '')) {
        el.remove();
      }
    });
  }

  function ensureDepositControls() {
    stripBalancePills();
    var actions = document.querySelector('.site-header-actions');
    if (actions && !actions.querySelector('.site-btn-deposit')) {
      var a = document.createElement('a');
      a.href = 'kibbisave_deposit_v2.html';
      a.className = 'site-btn-deposit';
      a.textContent = 'Deposit';
      actions.appendChild(a);
    }
    document.querySelectorAll('.site-btn-deposit, .nav-deposit-mobile').forEach(function (el) {
      el.textContent = 'Deposit';
      if (!el.getAttribute('href')) el.setAttribute('href', 'kibbisave_deposit_v2.html');
    });
  }

  function updateAuthButton(user, opts) {
    opts = opts || {};
    var isAuthed = !!user;
    var prev = document.body.classList.contains('is-authenticated');

    document.body.classList.toggle('is-authenticated', isAuthed);

    var links = authNodes();
    for (var i = 0; i < links.length; i++) {
      ensureAuthPair(links[i]);
    }

    links = authNodes();
    for (var j = 0; j < links.length; j++) {
      var link = links[j];
      if (isAuthed) {
        link.hidden = true;
        link.setAttribute('aria-hidden', 'true');
      } else {
        link.hidden = false;
        link.removeAttribute('aria-hidden');
      }
    }

    ensureDepositControls();

    if (!opts.skipCache) writeAuthCache(isAuthed);

    // Mirror on <html> for CSS that runs before body.auth-ready
    document.documentElement.classList.toggle('kb-authed', isAuthed);
    document.documentElement.classList.add('kb-auth-known');

    // Reveal only after state is applied — prevents JOIN NOW flash then hide
    if (!opts.keepHidden) {
      document.body.classList.add('auth-ready');
    }

    // Avoid a second paint when fetch confirms the same cached state
    if (opts.fromCache && prev === isAuthed) return;
  }

  function wireSignOut() {
    var btn = document.querySelector('.signout');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', function () {
      try {
        localStorage.removeItem('kibbi_home_cache_v1');
        localStorage.removeItem('kibbi_home_cache_v2');
      } catch (e) {}
      clearAuthCache();
      document.body.classList.remove('is-authenticated');
      document.documentElement.classList.remove('kb-authed');
      document.documentElement.classList.add('kb-auth-known');
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .catch(function () {})
        .finally(function () {
          window.location.href = 'kibbisave_home_final.html';
        });
    });
  }

  // Normalize brand text; remove logo marks + hamburger (bottom nav covers mobile)
  (function normalizeBrand() {
    document.querySelectorAll('.site-logo-mark').forEach(function (img) {
      img.remove();
    });
    document.querySelectorAll('.site-menu-toggle').forEach(function (btn) {
      btn.remove();
    });
    document.querySelectorAll('a.site-logo').forEach(function (a) {
      var text = (a.textContent || '').replace(/\s+/g, '');
      if (/kibbi/i.test(text) && !/^Kibbisave$/i.test(a.textContent.trim())) {
        a.textContent = 'Kibbisave';
      }
      if (!a.closest('.site-brand')) {
        var brand = document.createElement('div');
        brand.className = 'site-brand';
        a.replaceWith(brand);
        brand.appendChild(a);
      }
    });
  })();

  // Global search overlay (icon before Deposit / auth CTAs)
  (function initGlobalSearch() {
    var SEARCH_HINT = 'Search groups, communities, and profiles';
    var debounceTimer = null;
    var lastQuery = '';
    var abortCtrl = null;

    function searchIconSvg() {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    }

    function ensureSearchButton() {
      var actions = document.querySelector('.site-header-actions');
      if (!actions) return null;
      var btn = actions.querySelector('.site-btn-search');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'site-btn-search';
        btn.setAttribute('aria-label', 'Search');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = searchIconSvg();
        var deposit = actions.querySelector('.site-btn-deposit');
        var auth = actions.querySelector('.site-auth-pair, .site-auth-btn');
        var before = deposit || auth || actions.firstChild;
        if (before) actions.insertBefore(btn, before);
        else actions.appendChild(btn);
      }
      return btn;
    }

    function ensureOverlay() {
      var overlay = document.getElementById('kb-search-overlay');
      if (overlay) return overlay;
      overlay = document.createElement('div');
      overlay.id = 'kb-search-overlay';
      overlay.className = 'kb-search-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Search');
      overlay.innerHTML =
        '<div class="kb-search-panel">' +
          '<div class="kb-search-bar">' +
            searchIconSvg() +
            '<input class="kb-search-input" type="search" placeholder="Search groups, communities, profiles" autocomplete="off" enterkeyhint="search" />' +
            '<button type="button" class="kb-search-close">Close</button>' +
          '</div>' +
          '<div class="kb-search-results" id="kb-search-results">' +
            '<div class="kb-search-hint">' + SEARCH_HINT + '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      return overlay;
    }

    function escHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderResults(payload) {
      var box = document.getElementById('kb-search-results');
      if (!box) return;
      var q = (payload && payload.q) || '';
      var results = (payload && payload.results) || [];
      if (!q) {
        box.innerHTML = '<div class="kb-search-hint">' + escHtml((payload && payload.hint) || SEARCH_HINT) + '</div>';
        return;
      }
      if (!results.length) {
        box.innerHTML = '<div class="kb-search-empty"><img class="kb-illus" src="/assets/illustrations/svg/17-no-results-found.svg" alt="Character with a magnifying glass" width="160" height="160" decoding="async"><div>No matches for “' + escHtml(q) + '”</div></div>';
        return;
      }
      var html = '';
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        html +=
          '<a class="kb-search-item" href="' + escHtml(r.href || '#') + '">' +
            '<span class="kb-search-item-name">' + escHtml(r.name || '') + '</span>' +
            '<span class="kb-search-item-area">' + escHtml(r.area || '') + '</span>' +
          '</a>';
      }
      box.innerHTML = html;
    }

    function runSearch(q) {
      lastQuery = q;
      var box = document.getElementById('kb-search-results');
      if (!q) {
        renderResults({ q: '', results: [], hint: SEARCH_HINT });
        return;
      }
      if (box) box.innerHTML = '<div class="kb-search-loading">Searching…</div>';
      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();
      fetch('/api/search?q=' + encodeURIComponent(q), {
        credentials: 'include',
        signal: abortCtrl.signal
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (q !== lastQuery) return;
          renderResults(data || { q: q, results: [] });
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          if (q !== lastQuery) return;
          if (box) box.innerHTML = '<div class="kb-search-empty">Search unavailable. Try again.</div>';
        });
    }

    function openSearch() {
      var overlay = ensureOverlay();
      var btn = ensureSearchButton();
      overlay.classList.add('is-open');
      if (btn) btn.setAttribute('aria-expanded', 'true');
      var input = overlay.querySelector('.kb-search-input');
      if (input) {
        input.value = lastQuery || '';
        setTimeout(function () { input.focus(); }, 30);
      }
      if (!lastQuery) renderResults({ q: '', results: [], hint: SEARCH_HINT });
    }

    function closeSearch() {
      var overlay = document.getElementById('kb-search-overlay');
      var btn = document.querySelector('.site-btn-search');
      if (overlay) overlay.classList.remove('is-open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (debounceTimer) clearTimeout(debounceTimer);
    }

    var btn = ensureSearchButton();
    if (!btn) return;
    var overlay = ensureOverlay();

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (overlay.classList.contains('is-open')) closeSearch();
      else openSearch();
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSearch();
    });

    var closeBtn = overlay.querySelector('.kb-search-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSearch);

    var input = overlay.querySelector('.kb-search-input');
    if (input) {
      input.addEventListener('input', function () {
        var q = (input.value || '').trim();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () { runSearch(q); }, 280);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeSearch();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeSearch();
    });
  })();

  // Apply cached session immediately so refresh does not flash the wrong CTA
  var cached = readAuthCache();
  if (cached === true) {
    updateAuthButton({ cached: true }, { fromCache: true });
  } else if (cached === false) {
    updateAuthButton(null, { fromCache: true });
  }
  // else: stay opacity:0 until /api/auth/me resolves

  wireSignOut();

  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 6000);

  // BetPawa-style app shell: header + bottom nav stay put; only middle scrolls
  (function initAppShell() {
    if (document.body.classList.contains('auth-page')) return;
    var header = document.querySelector('.site-header');
    if (!header) return;
    if (document.querySelector('.kb-app-scroll')) {
      document.documentElement.classList.add('kb-app-shell');
      document.body.classList.add('kb-app-shell');
      return;
    }

    var shell = document.createElement('div');
    shell.className = 'kb-app-scroll';
    var node = header.nextSibling;
    while (node) {
      var next = node.nextSibling;
      if (node.nodeType === 1) {
        var tag = node.tagName;
        if (node.id === 'kb-bottom-nav' || node.classList.contains('kb-bottom-nav')) break;
        // Leave scripts/styles in body so they keep executing normally
        if (tag === 'SCRIPT' || tag === 'LINK' || tag === 'STYLE' || tag === 'TEMPLATE') {
          node = next;
          continue;
        }
        shell.appendChild(node);
      } else if (node.nodeType === 3 && String(node.textContent || '').trim()) {
        shell.appendChild(node);
      }
      node = next;
    }
    if (shell.childNodes.length) {
      if (header.nextSibling) {
        header.parentNode.insertBefore(shell, header.nextSibling);
      } else {
        header.parentNode.appendChild(shell);
      }
    }
    document.documentElement.classList.add('kb-app-shell');
    document.body.classList.add('kb-app-shell');
  })();

  // Mobile bottom navigation — Profile, Leaderboard, Analytics, Groups, Communities
  (function initMobileBottomNav() {
    var WAVE_KEY = 'kb_bnav_wave_from';
    var path = (window.location.pathname || '').split('/').pop() || '';
    if (/^login(\.html)?$/i.test(path) || /^signup(\.html)?$/i.test(path)) return;
    if (!document.querySelector('.site-header')) return;
    if (document.getElementById('kb-bottom-nav')) return;

    var tabs = [
      { id: 'profile', label: 'Profile', href: 'kibbisave_profile_screen.html', match: /kibbisave_profile/i },
      { id: 'leaderboard', label: 'Leaderboard', href: 'kibbisave_leaderboard_v5.html', match: /kibbisave_leaderboard/i },
      { id: 'analytics', label: 'Analytics', href: 'kibbisave_home_final.html', match: /kibbisave_home/i },
      { id: 'groups', label: 'Groups', href: 'kibbisave_groups_v6.html', match: /kibbisave_groups|kibbisave_join_group|kibbisave_create_group|kibbisave_my_group|kibbisave_deposit/i },
      { id: 'communities', label: 'Communities', href: 'kibbisave_community_explore.html', match: /kibbisave_community|kibbisave_cause/i }
    ];

    function iconSvg(id) {
      if (id === 'groups') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      if (id === 'analytics') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m5 14v-7m5 7V8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      }
      if (id === 'communities') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
      }
      if (id === 'leaderboard') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 5h2a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4M7 5H5a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    var activeIndex = 2;
    var html = '<div class="kb-bnav-wave" aria-hidden="true"></div>';
    var i;
    for (i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var active = false;
      if (t.id === 'analytics' && (!path || path === '/' || path === 'index.html')) {
        active = true;
      } else if (t.match) {
        active = t.match.test(path);
      }
      if (active) activeIndex = i;
      html +=
        '<a class="kb-bnav-item' + (active ? ' is-active' : '') + '" href="' + t.href + '"' +
        ' data-kb-bnav-i="' + i + '"' +
        (active ? ' aria-current="page"' : '') + '>' +
        iconSvg(t.id) + '<span>' + t.label + '</span></a>';
    }

    var nav = document.createElement('nav');
    nav.id = 'kb-bottom-nav';
    nav.className = 'kb-bottom-nav';
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML = html;
    document.body.appendChild(nav);
    document.body.classList.add('has-kb-bottom-nav');

    var wave = nav.querySelector('.kb-bnav-wave');
    var items = nav.querySelectorAll('.kb-bnav-item');

    var SETTLE_DELAY_MS = 160;
    var SLIDE_DELAY_MS = 120;
    var MORPH_MS = 460;

    function placeWave(index, animate, opts) {
      if (!wave || !items[index]) return;
      var item = items[index];
      var navRect = nav.getBoundingClientRect();
      var itemRect = item.getBoundingClientRect();
      var pad = 6;
      var fullW = Math.max(48, itemRect.width - pad * 2);
      var gather = opts && opts.gather;
      var w = gather ? Math.max(28, Math.round(fullW * 0.42)) : fullW;
      var x = itemRect.left - navRect.left + (itemRect.width - w) / 2;
      if (!animate) {
        var prev = wave.style.transition;
        wave.style.transition = 'none';
        wave.style.width = w + 'px';
        wave.style.transform = 'translateX(' + x + 'px)';
        void wave.offsetWidth;
        wave.style.transition = prev || '';
        return;
      }
      wave.classList.add('is-morphing');
      wave.style.width = w + 'px';
      wave.style.transform = 'translateX(' + x + 'px)';
      wave.classList.remove('is-rippling');
      void wave.offsetWidth;
      wave.classList.add('is-rippling');
      window.setTimeout(function () {
        wave.classList.remove('is-morphing');
      }, MORPH_MS);
    }

    var fromIndex = null;
    try {
      var raw = sessionStorage.getItem(WAVE_KEY);
      if (raw != null && raw !== '') fromIndex = parseInt(raw, 10);
      sessionStorage.removeItem(WAVE_KEY);
    } catch (e) {}

    function layoutWave() {
      if (fromIndex != null && !isNaN(fromIndex) && fromIndex !== activeIndex && fromIndex >= 0 && fromIndex < items.length) {
        placeWave(fromIndex, false);
        window.setTimeout(function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              placeWave(activeIndex, true);
            });
          });
        }, SLIDE_DELAY_MS);
      } else {
        /* First load / refresh: start gathered, then settle after a short delay */
        placeWave(activeIndex, false, { gather: true });
        window.setTimeout(function () {
          requestAnimationFrame(function () {
            placeWave(activeIndex, true);
          });
        }, SETTLE_DELAY_MS);
      }
      fromIndex = null;
    }

    if (document.readyState === 'complete') layoutWave();
    else window.addEventListener('load', layoutWave);
    window.addEventListener('resize', function () {
      placeWave(activeIndex, false);
    });

    for (i = 0; i < items.length; i++) {
      (function (idx) {
        items[idx].addEventListener('click', function () {
          try { sessionStorage.setItem(WAVE_KEY, String(activeIndex)); } catch (e) {}
        });
      })(i);
    }
  })();

  // Guest account menu — BetPawa-style slide-over when Profile is tapped without login
  (function initGuestAccountMenu() {
    var root = null;
    var closeGoesHome = false;

    function isAuthed() {
      return document.documentElement.classList.contains('kb-authed') ||
        document.body.classList.contains('is-authenticated');
    }

    function isProfilePath() {
      var path = (window.location.pathname || '').split('/').pop() || '';
      return /kibbisave_profile/i.test(path);
    }

    function isProfileLink(el) {
      if (!el || el.tagName !== 'A') return false;
      var href = el.getAttribute('href') || '';
      return /kibbisave_profile_screen/i.test(href);
    }

    function icon(name) {
      if (name === 'deposit') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 14v3"/></svg>';
      }
      if (name === 'theme') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
      }
      if (name === 'help') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>';
      }
      if (name === 'more') {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
      }
      return '';
    }

    function chevron() {
      return '<svg class="kb-guest-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>';
    }

    function syncDarkToggle() {
      if (!root) return;
      var toggle = root.querySelector('[data-kb-guest-dark]');
      if (!toggle) return;
      var on = !!(window.KibbiTheme && window.KibbiTheme.isDark && window.KibbiTheme.isDark());
      toggle.classList.toggle('is-on', on);
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function ensure() {
      if (root) return root;
      root = document.createElement('div');
      root.id = 'kb-guest-account';
      root.className = 'kb-guest-account';
      root.setAttribute('aria-hidden', 'true');
      root.innerHTML =
        '<div class="kb-guest-account-backdrop" data-kb-guest-close></div>' +
        '<aside class="kb-guest-account-panel" role="dialog" aria-modal="true" aria-label="Account">' +
          '<button type="button" class="kb-guest-account-close" data-kb-guest-close aria-label="Close account menu">×</button>' +
          '<div class="kb-guest-account-hero">' +
            '<p class="kb-guest-account-encourage">Join KibbiSave to track your groups, deposits, and savings progress — or log in if you already have an account.</p>' +
            '<div class="kb-guest-account-ctas">' +
              '<a class="kb-guest-btn-join" href="/login?tab=join">Join now</a>' +
              '<a class="kb-guest-btn-login" href="/login?tab=login">Log in</a>' +
            '</div>' +
          '</div>' +
          '<div class="kb-guest-account-card">' +
            '<a class="kb-guest-row" href="kibbisave_deposit_v2.html">' +
              '<span class="kb-guest-row-icon">' + icon('deposit') + '</span>' +
              '<span class="kb-guest-row-label">Deposit</span>' +
            '</a>' +
            '<button type="button" class="kb-guest-row" data-kb-guest-dark-row>' +
              '<span class="kb-guest-row-icon">' + icon('theme') + '</span>' +
              '<span class="kb-guest-row-label">Dark Theme</span>' +
              '<span class="kb-guest-row-trail"><span class="kb-guest-toggle" data-kb-guest-dark role="switch" aria-label="Dark theme"></span></span>' +
            '</button>' +
          '</div>' +
          '<div class="kb-guest-account-card">' +
            '<button type="button" class="kb-guest-row" data-kb-guest-expand="help" aria-expanded="false">' +
              '<span class="kb-guest-row-icon">' + icon('help') + '</span>' +
              '<span class="kb-guest-row-label">Help Center</span>' +
              '<span class="kb-guest-row-trail">' + chevron() + '</span>' +
            '</button>' +
            '<div class="kb-guest-sub" data-kb-guest-sub="help">' +
              '<a class="kb-guest-row" href="/legal/help.html">Help</a>' +
              '<a class="kb-guest-row" href="/legal/rules.html">Rules</a>' +
              '<a class="kb-guest-row" href="/legal/responsible-saving.html">Responsible Saving</a>' +
            '</div>' +
            '<button type="button" class="kb-guest-row" data-kb-guest-expand="more" aria-expanded="false">' +
              '<span class="kb-guest-row-icon">' + icon('more') + '</span>' +
              '<span class="kb-guest-row-label">More on KibbiSave</span>' +
              '<span class="kb-guest-row-trail">' + chevron() + '</span>' +
            '</button>' +
            '<div class="kb-guest-sub" data-kb-guest-sub="more">' +
              '<a class="kb-guest-row" href="/legal/about.html">About KibbiSave</a>' +
              '<a class="kb-guest-row" href="/legal/news.html">News</a>' +
            '</div>' +
          '</div>' +
        '</aside>';
      document.body.appendChild(root);

      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-kb-guest-close]')) {
          e.preventDefault();
          close();
          return;
        }
        var expand = e.target.closest('[data-kb-guest-expand]');
        if (expand) {
          var key = expand.getAttribute('data-kb-guest-expand');
          var sub = root.querySelector('[data-kb-guest-sub="' + key + '"]');
          var open = expand.getAttribute('aria-expanded') === 'true';
          expand.setAttribute('aria-expanded', open ? 'false' : 'true');
          if (sub) sub.classList.toggle('is-open', !open);
          return;
        }
        if (e.target.closest('[data-kb-guest-dark-row], [data-kb-guest-dark]')) {
          e.preventDefault();
          if (window.KibbiTheme && window.KibbiTheme.setDark) {
            window.KibbiTheme.setDark(!window.KibbiTheme.isDark());
          }
          syncDarkToggle();
        }
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && root.classList.contains('is-open')) close();
      });

      return root;
    }

    function open(opts) {
      opts = opts || {};
      closeGoesHome = !!opts.closeGoesHome || isProfilePath();
      ensure();
      syncDarkToggle();
      root.classList.add('is-open');
      root.setAttribute('aria-hidden', 'false');
      document.body.classList.add('kb-guest-account-open');
    }

    function close() {
      if (!root) return;
      root.classList.remove('is-open');
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('kb-guest-account-open');
      if (closeGoesHome) {
        closeGoesHome = false;
        window.location.href = 'kibbisave_home_final.html';
      }
    }

    window.KibbiGuestAccount = {
      open: open,
      close: close,
      isOpen: function () { return !!(root && root.classList.contains('is-open')); }
    };

    document.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (!link || !isProfileLink(link)) return;
      if (isAuthed()) {
        e.preventDefault();
        e.stopPropagation();
        if (window.KibbiProfileOverlay && typeof window.KibbiProfileOverlay.open === 'function') {
          window.KibbiProfileOverlay.open();
        } else {
          window.location.href = 'kibbisave_profile_screen.html';
        }
        return;
      }
      e.preventDefault();
      open({ closeGoesHome: isProfilePath() });
    }, true);

    if (isProfilePath() && !isAuthed()) {
      // Open after a tick so auth cache / body classes are applied
      window.setTimeout(function () {
        if (!isAuthed()) open({ closeGoesHome: true });
      }, 40);
    }
  })();

  // Logged-in profile overlay — keep current page alive underneath
  (function initAuthedProfileOverlay() {
    if (document.body.classList.contains('auth-page')) return;
    if (document.documentElement.classList.contains('kb-embed')) return;

    var RETURN_KEY = 'kb_profile_return';
    var overlay = null;
    var frame = null;
    var loaded = false;
    var opening = false;

    function ensure() {
      if (overlay) return overlay;
      overlay = document.createElement('div');
      overlay.id = 'kb-profile-overlay';
      overlay.className = 'kb-profile-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML =
        '<iframe class="kb-profile-overlay-frame" title="Profile" src="about:blank"></iframe>';
      document.body.appendChild(overlay);
      frame = overlay.querySelector('iframe');
      window.addEventListener('message', function (e) {
        if (!e || !e.data) return;
        if (e.data.type === 'kb-profile-close') {
          close();
        } else if (e.data.type === 'kb-profile-navigate' && e.data.href) {
          close(true);
          window.location.href = e.data.href;
        }
      });
      return overlay;
    }

    function resetEmbed() {
      if (!frame || !frame.contentWindow) return;
      try {
        frame.contentWindow.postMessage({ type: 'kb-profile-reset' }, '*');
      } catch (err) {}
    }

    function open() {
      if (opening) return;
      opening = true;
      try {
        sessionStorage.setItem(RETURN_KEY, window.location.href);
      } catch (err) {}
      ensure();

      // Start fully off-screen, then slide in (forces transition on every reopen)
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('kb-profile-overlay-open');
      void overlay.offsetWidth;

      if (!loaded && frame) {
        frame.src = 'kibbisave_profile_screen.html?embed=1';
        loaded = true;
      } else {
        resetEmbed();
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          overlay.classList.add('is-open');
          opening = false;
        });
      });
    }

    function close(instant) {
      if (!overlay) return;
      opening = false;
      if (instant) {
        overlay.style.transition = 'none';
        overlay.classList.remove('is-open');
        void overlay.offsetWidth;
        overlay.style.transition = '';
      } else {
        overlay.classList.remove('is-open');
      }
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('kb-profile-overlay-open');
      resetEmbed();
    }

    window.KibbiProfileOverlay = {
      open: open,
      close: close,
      isOpen: function () {
        return !!(overlay && overlay.classList.contains('is-open'));
      },
    };
  })();

  // Stay-up-to-date socials + BetPawa-style Back to top (near end of scroll)
  (function initStaySocialAndBackToTop() {
    if (document.body.classList.contains('auth-page')) return;

    function socialSvg(name) {
      if (name === 'facebook') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
      }
      if (name === 'x') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.59l-5.16-6.74L5.2 22H1.94l8.03-9.17L1.5 2h6.75l4.66 6.18L18.244 2zm-1.16 18h1.82L7.03 3.94H5.08L17.084 20z"/></svg>';
      }
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>';
    }

    function ensureStaySocial() {
      if (document.querySelector('.kb-stay-social')) return;
      var footer = document.querySelector('.site-footer');
      if (!footer) return;
      var box = document.createElement('div');
      box.className = 'kb-stay-social';
      box.setAttribute('aria-label', 'Social links');
      box.innerHTML =
        '<div class="kb-stay-label">Stay up to date</div>' +
        '<div class="kb-stay-icons">' +
          '<a href="https://www.facebook.com/" class="kb-stay-link" target="_blank" rel="noopener noreferrer" aria-label="Facebook">' + socialSvg('facebook') + '</a>' +
          '<a href="https://x.com/" class="kb-stay-link" target="_blank" rel="noopener noreferrer" aria-label="X">' + socialSvg('x') + '</a>' +
          '<a href="https://www.instagram.com/" class="kb-stay-link" target="_blank" rel="noopener noreferrer" aria-label="Instagram">' + socialSvg('instagram') + '</a>' +
        '</div>';
      var legal = footer.querySelector('.site-footer-legal, .kb-legal-footer-inner');
      if (legal) footer.insertBefore(box, legal);
      else footer.appendChild(box);
      footer.classList.add('site-footer--rich');
    }

    function scrollRoot() {
      return document.querySelector('.kb-app-scroll') || document.scrollingElement || document.documentElement;
    }

    function ensureBackToTop() {
      var btn = document.getElementById('kb-back-to-top');
      if (btn) return btn;
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'kb-back-to-top';
      btn.className = 'kb-back-to-top';
      btn.setAttribute('aria-label', 'Back to top');
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>' +
        '<span>Back to top</span>';
      btn.addEventListener('click', function () {
        var root = scrollRoot();
        // Instant jump — screens are short
        if (root === document.scrollingElement || root === document.documentElement || root === document.body) {
          window.scrollTo(0, 0);
        } else if (root) {
          root.scrollTop = 0;
        }
      });
      document.body.appendChild(btn);
      return btn;
    }

    function updateVisibility() {
      var btn = ensureBackToTop();
      var root = scrollRoot();
      var top = root.scrollTop || window.pageYOffset || 0;
      var view = root.clientHeight || window.innerHeight || 0;
      var height = root.scrollHeight || document.documentElement.scrollHeight || 0;
      var nearEnd = height > view + 120 && top + view >= height - 140;
      var scrolledDown = top > Math.min(480, view * 0.85);
      btn.classList.toggle('is-visible', nearEnd || (scrolledDown && top + view >= height - 320));
    }

    ensureStaySocial();
    ensureBackToTop();

    var root = scrollRoot();
    var target = root === document.documentElement || root === document.body ? window : root;
    target.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    window.setTimeout(updateVisibility, 80);
    window.setTimeout(function () {
      // App shell may wrap content after this script starts
      var next = scrollRoot();
      if (next !== root && next !== document.documentElement && next !== document.body) {
        next.addEventListener('scroll', updateVisibility, { passive: true });
      }
      updateVisibility();
    }, 200);
  })();

  fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      updateAuthButton(data.authenticated ? data.user : null);
      if (data.authenticated) {
        fetch('/api/profile/settings', { credentials: 'include' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.settings) return;
            if (typeof d.settings.dark_mode === 'boolean') {
              applyDarkMode(d.settings.dark_mode);
            }
          })
          .catch(function () {});
      }
    })
    .catch(function () {
      // Keep cached UI if network fails after a warm cache paint
      if (cached === null) updateAuthButton(null);
      else document.body.classList.add('auth-ready');
    })
    .finally(function () {
      clearTimeout(timeout);
      document.body.classList.add('auth-ready');
    });
})();
