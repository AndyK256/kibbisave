(function () {
  var toggle = document.querySelector('.site-menu-toggle');
  var nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      toggle.classList.toggle('open');
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        toggle.classList.remove('open');
        nav.classList.remove('open');
      });
    });
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

  function shortDisplayName(fullName) {
    if (!fullName) return 'Account';
    var parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts[1] : parts[0];
  }

  function updateAuthButton(user) {
    var link = document.querySelector('[data-auth-link]');
    if (!link) {
      link = document.querySelector('.site-auth-btn');
    }
    if (!link) return;

    if (user) {
      link.href = 'kibbisave_profile_screen.html';
      link.textContent = shortDisplayName(user.name);
      link.title = user.email || '';
    } else {
      link.href = '/login';
      link.textContent = 'Sign in';
      link.title = '';
    }
  }

  function wireSignOut() {
    var btn = document.querySelector('.signout');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .then(function () { window.location.href = '/login'; });
    });
  }

  updateAuthButton(null);
  wireSignOut();

  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 6000);

  fetch('/api/auth/me', { credentials: 'include', signal: controller.signal })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      updateAuthButton(data.authenticated ? data.user : null);
    })
    .catch(function () {
      updateAuthButton(null);
    })
    .finally(function () {
      clearTimeout(timeout);
    });
})();
