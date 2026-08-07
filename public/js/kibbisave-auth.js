(function () {
  var DISTRICTS = [
    'Kampala', 'Abim', 'Adjumani', 'Agago', 'Alebtong', 'Amolatar', 'Amudat', 'Amuria', 'Amuru', 'Apac',
    'Arua', 'Budaka', 'Bududa', 'Bugiri', 'Buhweju', 'Buikwe', 'Bukedea', 'Bukomansimbi', 'Bukwa',
    'Bulambuli', 'Buliisa', 'Bundibugyo', 'Bushenyi', 'Busia', 'Butaleja', 'Butambala', 'Buvuma',
    'Buyende', 'Dokolo', 'Gomba', 'Gulu', 'Hoima', 'Ibanda', 'Iganga', 'Isingiro', 'Jinja',
    'Kaabong', 'Kabale', 'Kabarole', 'Kaberamaido', 'Kalangala', 'Kaliro', 'Kalungu', 'Kamuli',
    'Kamwenge', 'Kanungu', 'Kapchorwa', 'Kasese', 'Katakwi', 'Kayunga', 'Kibaale', 'Kiboga',
    'Kibuku', 'Kiruhura', 'Kiryandongo', 'Kisoro', 'Kitgum', 'Koboko', 'Kole', 'Kotido', 'Kumi',
    'Kween', 'Kyankwanzi', 'Kyegegwa', 'Kyenjojo', 'Lamwo', 'Lira', 'Luuka', 'Luweero', 'Lwengo',
    'Lyantonde', 'Manafwa', 'Maracha', 'Masaka', 'Masindi', 'Mayuge', 'Mbale', 'Mbarara',
    'Mitooma', 'Mityana', 'Moroto', 'Moyo', 'Mpigi', 'Mubende', 'Mukono', 'Nakapiripirit',
    'Nakaseke', 'Nakasongola', 'Namayingo', 'Namutumba', 'Napak', 'Nebbi', 'Ngora', 'Ntoroko',
    'Ntungamo', 'Nwoya', 'Otuke', 'Oyam', 'Pader', 'Pallisa', 'Rakai', 'Rubirizi', 'Rukungiri',
    'Sembabule', 'Serere', 'Sheema', 'Sironko', 'Soroti', 'Tororo', 'Wakiso', 'Yumbe', 'Zombo'
  ];

  var NATIONALITIES = [
    'Ugandan', 'Kenyan', 'Tanzanian', 'Rwandan', 'Burundian', 'South Sudanese', 'Congolese',
    'Nigerian', 'Ghanaian', 'South African', 'British', 'American', 'Indian', 'Chinese',
    'Other'
  ];

  var params = new URLSearchParams(window.location.search);
  var errorEl = document.getElementById('auth-error');

  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg || 'Something went wrong. Please try again.';
    errorEl.classList.add('show');
  }

  function clearError() {
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.classList.remove('show');
  }

  function markSignedIn() {
    try { sessionStorage.setItem('kibbi_auth_v1', '1'); } catch (e) {}
  }

  function goHome(redirect) {
    markSignedIn();
    window.location.href = redirect || '/kibbisave_home_final.html?signed_in=1';
  }

  function fillSelect(el, items, preferred) {
    if (!el) return;
    el.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select…';
    el.appendChild(placeholder);
    for (var i = 0; i < items.length; i++) {
      var opt = document.createElement('option');
      opt.value = items[i];
      opt.textContent = items[i];
      if (preferred && items[i] === preferred) opt.selected = true;
      el.appendChild(opt);
    }
  }

  fillSelect(document.getElementById('j-district'), DISTRICTS, 'Kampala');
  fillSelect(document.getElementById('c-district'), DISTRICTS, 'Kampala');
  fillSelect(document.getElementById('j-nationality'), NATIONALITIES, 'Ugandan');
  fillSelect(document.getElementById('c-nationality'), NATIONALITIES, 'Ugandan');

  var tabs = document.querySelectorAll('.auth-tab');
  var panelLogin = document.getElementById('panel-login');
  var panelJoin = document.getElementById('panel-join');
  var panelComplete = document.getElementById('panel-complete');
  var tabBar = document.querySelector('.auth-tabs');

  function setTab(name) {
    clearError();
    var isJoin = name === 'join';
    var isComplete = name === 'complete';

    if (tabBar) tabBar.hidden = isComplete;
    if (panelComplete) panelComplete.hidden = !isComplete;
    if (panelLogin) panelLogin.hidden = isComplete || isJoin;
    if (panelJoin) panelJoin.hidden = isComplete || !isJoin;

    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var active = !isComplete && t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    }

    if (!isComplete) {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('tab', name);
        url.searchParams.delete('complete');
        window.history.replaceState({}, '', url.pathname + '?' + url.searchParams.toString());
      } catch (e) {}
    }

    document.title = isComplete
      ? 'Complete profile — Kibbisave'
      : (isJoin ? 'Join Now — Kibbisave' : 'Log In — Kibbisave');
  }

  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      setTab(this.getAttribute('data-tab'));
    });
  }

  document.querySelectorAll('[data-switch]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      setTab(a.getAttribute('data-switch'));
    });
  });

  document.querySelectorAll('.auth-show-pw').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-target');
      var input = document.getElementById(id);
      if (!input) return;
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  });

  // Email-ish login: hide +256 prefix when typing email
  var loginId = document.getElementById('l-phone');
  var loginCc = loginId && loginId.closest('.auth-phone')
    ? loginId.closest('.auth-phone').querySelector('.auth-phone-cc')
    : null;
  if (loginId && loginCc) {
    loginId.addEventListener('input', function () {
      var v = loginId.value.trim();
      loginCc.hidden = v.indexOf('@') !== -1;
    });
  }

  var oauthErrors = {
    access_denied: 'Sign-in was cancelled.',
    missing_code: 'Google did not return an authorization code.',
    token_exchange_failed: 'Could not complete Google sign-in. Please try again later.',
    profile_failed: 'Could not load your Google profile.',
    not_configured: 'Google sign-in is not configured on the server.',
    server_error: 'Something went wrong. Please try again.',
  };

  var err = params.get('error');
  if (err) showError(oauthErrors[err] || 'Sign-in failed. Please try again.');

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  var formJoin = document.getElementById('form-join');
  if (formJoin) {
    formJoin.addEventListener('submit', function (e) {
      e.preventDefault();
      clearError();
      var terms = document.getElementById('j-terms');
      if (terms && !terms.checked) {
        showError('Accept the Terms and Conditions to continue.');
        return;
      }
      var btn = formJoin.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      postJson('/api/auth/register', {
        phone: document.getElementById('j-phone').value,
        password: document.getElementById('j-password').value,
        firstName: document.getElementById('j-first').value,
        lastName: document.getElementById('j-last').value,
        district: document.getElementById('j-district').value,
        nationality: document.getElementById('j-nationality').value,
        nin: document.getElementById('j-nin').value,
        termsAccepted: true,
      })
        .then(function (res) {
          if (!res.ok) {
            showError((res.data && res.data.error) || 'Could not create account.');
            return;
          }
          goHome(res.data && res.data.redirect);
        })
        .catch(function () {
          showError('Network error. Please try again.');
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  var formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', function (e) {
      e.preventDefault();
      clearError();
      var btn = formLogin.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      postJson('/api/auth/login', {
        identifier: document.getElementById('l-phone').value,
        password: document.getElementById('l-password').value,
      })
        .then(function (res) {
          if (!res.ok) {
            showError((res.data && res.data.error) || 'Could not log in.');
            return;
          }
          goHome(res.data && res.data.redirect);
        })
        .catch(function () {
          showError('Network error. Please try again.');
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  var formComplete = document.getElementById('form-complete');
  if (formComplete) {
    formComplete.addEventListener('submit', function (e) {
      e.preventDefault();
      clearError();
      var btn = formComplete.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      postJson('/api/auth/complete-profile', {
        phone: document.getElementById('c-phone').value,
        district: document.getElementById('c-district').value,
        nationality: document.getElementById('c-nationality').value,
        nin: document.getElementById('c-nin').value,
      })
        .then(function (res) {
          if (!res.ok) {
            showError((res.data && res.data.error) || 'Could not save profile.');
            return;
          }
          goHome(res.data && res.data.redirect);
        })
        .catch(function () {
          showError('Network error. Please try again.');
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  function enterCompleteMode(user) {
    setTab('complete');
    if (user) {
      if (user.phone) {
        var p = String(user.phone).replace(/^\+?256/, '');
        var cPhone = document.getElementById('c-phone');
        if (cPhone) cPhone.value = p;
      }
      if (user.district) {
        var d = document.getElementById('c-district');
        if (d) d.value = user.district;
      }
      if (user.nationality) {
        var n = document.getElementById('c-nationality');
        if (n) n.value = user.nationality;
      }
      if (user.nin) {
        var nin = document.getElementById('c-nin');
        if (nin) nin.value = user.nin;
      }
    }
  }

  // Initial tab / complete-profile gate
  if (params.get('complete') === '1') {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.authenticated) {
          setTab(params.get('tab') === 'login' ? 'login' : 'join');
          showError('Sign in with Google first, then complete your profile.');
          return;
        }
        if (data.profileComplete) {
          goHome('/kibbisave_home_final.html?signed_in=1');
          return;
        }
        enterCompleteMode(data.user);
      })
      .catch(function () {
        setTab('join');
      });
  } else {
    var initial = params.get('tab') === 'login' ? 'login' : 'join';
    // /signup redirects here with join
    if (/signup/i.test(window.location.pathname)) initial = 'join';
    setTab(initial);

    // If already signed in with incomplete profile, force complete step
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.authenticated && data.profileComplete === false) {
          enterCompleteMode(data.user);
        }
      })
      .catch(function () {});
  }
})();
