(function () {
  var scroll = document.getElementById('ka-scroll');
  var dock = document.getElementById('ka-dock');
  var state = {
    user: null,
    kycComplete: false,
    afterAuth: null,
    screen: 'welcome',
    hiddenBalance: true,
    pendingCount: 0,
    communities: [],
    community: null,
    member: null,
    kycPhoto: null,
    cameraStream: null,
    pinResolver: null,
    txPeriod: 'all'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) {
    return 'UGX ' + (Number(n) || 0).toLocaleString('en-UG');
  }
  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }
  function showMsg(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-on', Boolean(text));
  }
  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(function (t) { t.stop(); });
      state.cameraStream = null;
    }
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch('/api' + path, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: Object.assign({ Accept: 'application/json' }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); });
  }

  function askPin() {
    return new Promise(function (resolve) {
      state.pinResolver = resolve;
      var sheet = document.getElementById('ka-pin-sheet');
      sheet.hidden = false;
      sheet.setAttribute('aria-hidden', 'false');
      sheet.classList.add('is-on');
      showMsg('pin-error', '');
      document.querySelectorAll('[data-pin]').forEach(function (input) { input.value = ''; });
      var first = document.querySelector('[data-pin="0"]');
      if (first) first.focus();
    });
  }
  function closePin(value) {
    var sheet = document.getElementById('ka-pin-sheet');
    sheet.classList.remove('is-on');
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    var fn = state.pinResolver;
    state.pinResolver = null;
    if (fn) fn(value || null);
  }
  function pinValue() {
    return Array.prototype.map.call(document.querySelectorAll('[data-pin]'), function (i) { return i.value; }).join('');
  }

  function isReadyAdmin() {
    return Boolean(state.user && state.kycComplete);
  }

  function needAuth(next) {
    state.afterAuth = next || state.screen;
    go('login');
  }

  function guestBar(message) {
    if (isReadyAdmin()) return '';
    if (state.user && !state.kycComplete) {
      return '<div class="ka-note">' + esc(message || 'Complete collector KYC to register members and approve deposits.') +
        ' <button type="button" class="ka-link" data-go="kyc" style="display:inline;margin:0;">Continue KYC</button></div>';
    }
    return '<div class="ka-note">' + esc(message || 'Browse freely. Log in to register members and approve cash.') +
      ' <button type="button" class="ka-link" data-go="login" style="display:inline;margin:0;">Log in</button>' +
      ' · <button type="button" class="ka-link" data-go="kyc" style="display:inline;margin:0;">Create account</button></div>';
  }

  function setDock(on) {
    dock.hidden = on === false;
    document.querySelectorAll('.ka-dock button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-go') === state.screen);
    });
    var badge = document.getElementById('nav-badge');
    if (badge) {
      badge.hidden = state.pendingCount < 1;
      badge.textContent = state.pendingCount > 9 ? '9+' : String(state.pendingCount);
    }
  }

  function go(name, extra) {
    stopCamera();
    state.screen = name;
    if (extra) Object.assign(state, extra);
    render();
  }

  function capturePhoto() {
    var video = document.getElementById('kyc-video');
    if (!video || !video.videoWidth) return null;
    var canvas = document.createElement('canvas');
    var size = 320;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var min = Math.min(video.videoWidth, video.videoHeight);
    var sx = (video.videoWidth - min) / 2;
    var sy = (video.videoHeight - min) / 2;
    ctx.drawImage(video, sx, sy, min, min, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  function startCamera() {
    var video = document.getElementById('kyc-video');
    if (!video || !navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (stream) {
        state.cameraStream = stream;
        video.srcObject = stream;
        video.play();
      })
      .catch(function () {
        showMsg('kyc-error', 'Allow camera access to scan your face.');
      });
  }

  function authShell(inner) {
    return '<div class="ka-auth-brand">' +
      '<img src="/assets/kibbisave.jpg" alt="KibbiSave">' +
      '<h1>Kibbi Admin</h1>' +
      '<p class="ka-muted">For community collectors who register members and approve cash deposits.</p>' +
      '</div>' + inner;
  }

  function screens() {
    return {
      welcome: function () {
        return authShell(
          '<div class="ka-section">' +
          '<button class="ka-cta" data-go="login">Log in</button>' +
          '<button class="ka-link" data-go="kyc">Create a collector account</button>' +
          '</div>'
        );
      },
      login: function () {
        return '<div class="ka-top"><button class="ka-back" data-go="home" aria-label="Back">‹</button><h1>Log in</h1></div>' +
          authShell(
          '<div class="ka-error" id="login-error"></div>' +
          '<div class="ka-field"><label>Phone, email or username</label><input id="login-id" autocomplete="username"></div>' +
          '<div class="ka-field"><label>Password</label><input id="login-pass" type="password" autocomplete="current-password"></div>' +
          '<button class="ka-cta" id="login-btn">Continue</button>' +
          '<button class="ka-link" data-go="kyc">I am a new community admin</button>'
        );
      },
      kyc: function () {
        return '<div class="ka-top"><button class="ka-back" data-go="home" aria-label="Back">‹</button><h1>Admin KYC</h1></div>' +
          '<p class="ka-muted" style="margin-bottom:12px;">These details verify you as the person who can credit members in your private communities.</p>' +
          '<div class="ka-error" id="kyc-error"></div>' +
          '<div class="ka-video-wrap"><video id="kyc-video" playsinline autoplay muted></video><div class="ka-face-ring"></div></div>' +
          '<button class="ka-cta" id="kyc-snap" type="button">Scan live face photo</button>' +
          '<img id="kyc-preview" alt="" style="display:none;border-radius:16px;margin:10px 0;">' +
          '<div class="ka-field"><label>First name</label><input id="kyc-first"></div>' +
          '<div class="ka-field"><label>Second name</label><input id="kyc-last"></div>' +
          '<div class="ka-field"><label>Email</label><input id="kyc-email" type="email"></div>' +
          '<div class="ka-field"><label>Address</label><input id="kyc-address"></div>' +
          '<div class="ka-field"><label>Tel no</label><input id="kyc-phone" type="tel" placeholder="07XXXXXXXX"></div>' +
          '<div class="ka-field"><label>NIN</label><input id="kyc-nin"></div>' +
          '<div class="ka-field" id="kyc-pass-wrap"><label>Account password</label><input id="kyc-pass" type="password"></div>' +
          '<div class="ka-field"><label>4-digit approval PIN</label><input id="kyc-pin" inputmode="numeric" maxlength="4" placeholder="••••"></div>' +
          '<button class="ka-cta" id="kyc-submit">Create admin account</button>';
      },
      home: function (data) {
        data = data || {};
        var name = data.greetingName || (state.user && state.user.firstName) || '';
        var greet = name ? (greeting() + ', ' + name + '!') : (greeting() + '.');
        var amount = state.hiddenBalance || !isReadyAdmin() ? 'UGX ••••••' : fmt(data.totalCollected);
        return '<div class="ka-greet">' + esc(greet) + '</div>' +
          guestBar() +
          '<section class="ka-hero">' +
          '<div class="ka-hero-top"><div><div class="ka-hero-label">Collected &amp; approved</div><div class="ka-hero-amt" id="hero-amt">' + esc(amount) + '</div></div>' +
          '<button class="ka-eye" id="toggle-bal" aria-label="Toggle balance">' + (state.hiddenBalance ? 'Show' : 'Hide') + '</button></div>' +
          '<div class="ka-hero-actions">' +
          '<button class="ka-pill" data-go="register">Register member</button>' +
          '<button class="ka-pill ka-pill--ghost" data-go="create-community">Create community</button>' +
          '</div></section>' +
          '<div class="ka-section"><h2>Our services</h2><div class="ka-grid">' +
          card('register', '/assets/illustrations/svg/12-complete-your-profile.svg', 'Register Member') +
          card('communities', '/assets/illustrations/svg/29-your-group.svg', 'Communities') +
          card('approvals', '/assets/illustrations/svg/19-safe-and-secure.svg', 'Approve Deposits' + (state.pendingCount ? ' (' + state.pendingCount + ')' : '')) +
          card('transactions', '/assets/illustrations/svg/23-your-balance.svg', 'Transaction History') +
          '</div></div>' +
          '<div class="ka-section"><h2>Alerts</h2><div class="ka-banners" id="ka-banners">' +
          '<article class="ka-banner"><h3>Private communities only</h3><p>You manage members you register and cash you physically receive.</p></article>' +
          '<article class="ka-banner"><h3>' + (state.pendingCount || 0) + ' waiting</h3><p>Consumer app cash and MoMo requests land here until you PIN-approve them.</p></article>' +
          '<article class="ka-banner"><h3>Groups cap at 7</h3><p>New members are placed in the public group closest to filling for their period.</p></article>' +
          '</div></div>';
      },
      register: function () {
        var opts = (state.communities || []).map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
        }).join('');
        return '<div class="ka-top"><button class="ka-back" data-go="home" aria-label="Back">‹</button><h1>Register member</h1></div>' +
          guestBar('Log in as a collector to submit a new member.') +
          '<div class="ka-error" id="reg-error"></div>' +
          '<div class="ka-ok" id="reg-ok"></div>' +
          '<div class="ka-field"><label>First name</label><input id="reg-first"></div>' +
          '<div class="ka-field"><label>Second name</label><input id="reg-last"></div>' +
          '<div class="ka-field"><label>Username</label><input id="reg-user" autocomplete="off"></div>' +
          '<div class="ka-field"><label>Password</label><input id="reg-pass" type="password"></div>' +
          '<div class="ka-field"><label>Confirm password</label><input id="reg-pass2" type="password"></div>' +
          '<div class="ka-field"><label>NIN</label><input id="reg-nin"></div>' +
          '<div class="ka-field"><label>Period</label><select id="reg-period"><option value="2">2 months</option><option value="3">3 months</option><option value="5">5 months</option><option value="8">8 months</option><option value="12" selected>12 months</option></select></div>' +
          '<div class="ka-field"><label>Amount (goal)</label><input id="reg-amount" inputmode="numeric" placeholder="500000"></div>' +
          '<div class="ka-field"><label>Daily rate (auto, editable)</label><input id="reg-rate" inputmode="numeric"></div>' +
          '<div class="ka-field"><label>Already deposited</label><input id="reg-paid" inputmode="numeric" value="0"></div>' +
          '<div class="ka-field"><label>Community</label><select id="reg-community"><option value="">Select community</option>' + opts + '</select></div>' +
          '<p class="ka-muted" id="reg-end"></p>' +
          '<button class="ka-cta" id="reg-review">Review &amp; approve</button>';
      },
      'register-confirm': function () {
        var d = state.registerDraft || {};
        return '<div class="ka-top"><button class="ka-back" data-go="register" aria-label="Back">‹</button><h1>Approve registration</h1></div>' +
          '<div class="ka-card" style="padding:14px;">' +
          '<p><b>' + esc(d.firstName) + ' ' + esc(d.lastName) + '</b></p>' +
          '<p class="ka-muted">@' + esc(d.username) + ' · ' + esc(d.periodMonths) + ' months · ' + fmt(d.goalAmount) + '</p>' +
          '<p class="ka-amt" style="margin-top:8px;">Daily ' + fmt(d.dailyRate) + ' · Paid in ' + fmt(d.alreadyDeposited) + '</p>' +
          '<p class="ka-muted">Community: ' + esc(d.communityName) + '</p></div>' +
          '<div class="ka-note" id="reg-book" hidden></div>' +
          '<div class="ka-error" id="reg-error"></div>' +
          '<button class="ka-cta" id="reg-submit">Approve with PIN</button>';
      },
      communities: function () {
        var list = (state.communities || []).map(function (c) {
          return '<button type="button" class="ka-row" data-open-community="' + esc(c.id) + '">' +
            '<div class="ka-row-ico">' + esc((c.icon || '👥')) + '</div>' +
            '<div class="ka-row-mid"><b>' + esc(c.name) + '</b><small>' + esc(c.total_members) + ' members · ' + fmt(c.total_saved) + '</small></div>' +
            '<span class="ka-chev">›</span></button>';
        }).join('');
        return '<div class="ka-top"><button class="ka-back" data-go="home" aria-label="Back">‹</button><h1>Communities</h1>' +
          '<button class="ka-icon-btn" data-go="create-community">+</button></div>' +
          '<input class="ka-search" id="comm-search" placeholder="Search a member across your communities">' +
          '<div id="comm-search-results"></div>' +
          guestBar('Log in to open the private communities you collect for.') +
          (list || empty('No private communities yet', isReadyAdmin() ? 'Create one to start registering members.' : 'Sign in to see communities linked to your collector account.'));
      },
      'create-community': function () {
        return '<div class="ka-top"><button class="ka-back" data-go="communities" aria-label="Back">‹</button><h1>Create community</h1></div>' +
          '<p class="ka-muted" style="margin-bottom:12px;">Private — only you can onboard members here.</p>' +
          guestBar('Log in to create a private community.') +
          '<div class="ka-error" id="cc-error"></div>' +
          '<div class="ka-field"><label>Name</label><input id="cc-name" placeholder="St Jude Community"></div>' +
          '<div class="ka-field"><label>About</label><textarea id="cc-about" rows="3"></textarea></div>' +
          '<button class="ka-cta" id="cc-submit">Create with PIN</button>';
      },
      members: function () {
        var c = state.community || {};
        var rows = (c.members || []).map(function (m) {
          return '<div class="ka-row">' +
            '<button type="button" class="ka-row-mid" data-open-member="' + esc(m.id) + '" style="background:none;border:0;text-align:left;flex:1;padding:0;">' +
            '<b>' + esc(m.display_name) + '</b><small>' + fmt(m.total_savings) + ' of ' + fmt(m.total_goal) + '</small></button>' +
            '<button type="button" class="ka-dep-btn" data-deposit-member="' + esc(m.id) + '">Deposit</button></div>';
        }).join('');
        return '<div class="ka-top"><button class="ka-back" data-go="communities" aria-label="Back">‹</button><h1>' + esc(c.name || 'Members') + '</h1></div>' +
          '<input class="ka-search" id="mem-search" placeholder="Search this community">' +
          (rows || empty('No members yet', 'Use Register to add the first person.'));
      },
      'member-history': function () {
        var m = (state.member && state.member.member) || {};
        var txs = ((state.member && state.member.transactions) || []).map(function (t) {
          return '<div class="ka-li"><div class="ka-row-mid"><b>' + fmt(t.amount) + '</b><small>' + esc(t.payment_method) + ' · ' + esc(t.status) + '</small></div><span class="ka-muted">' + new Date(t.created_at).toLocaleDateString() + '</span></div>';
        }).join('');
        return '<div class="ka-top"><button class="ka-back" data-go="members" aria-label="Back">‹</button><h1>' + esc(m.display_name) + '</h1></div>' +
          '<div class="ka-card" style="padding:14px;margin-bottom:12px;"><div class="ka-amt" style="font-size:1.3rem;">' + fmt(m.total_savings) + '</div><p class="ka-muted">Total savings · ' + esc(m.username || '') + '</p></div>' +
          '<div class="ka-list">' + (txs || '<div class="ka-li">No approved deposits yet.</div>') + '</div>';
      },
      deposit: function () {
        var m = (state.member && state.member.member) || {};
        var gap = Number(state.member && state.member.amountOnTrackGap) || 0;
        var label = gap >= 0 ? 'Amount behind' : 'Amount in front';
        return '<div class="ka-top"><button class="ka-back" data-go="members" aria-label="Back">‹</button><h1>Deposit</h1></div>' +
          '<p class="ka-muted">' + esc(m.display_name) + '</p>' +
          '<div class="ka-card" style="padding:14px;margin:12px 0;"><div class="ka-muted">' + label + '</div><div class="ka-amt" style="font-size:1.25rem;">' + fmt(Math.abs(gap)) + '</div></div>' +
          '<div class="ka-error" id="dep-error"></div>' +
          '<div class="ka-field"><label>Amount received</label><input id="dep-amt" inputmode="numeric" placeholder="50000"></div>' +
          '<label class="ka-check"><input type="checkbox" id="dep-ack"> I agree that I have received this person’s money.</label>' +
          '<button class="ka-cta" id="dep-submit">Approve</button>';
      },
      transactions: function (pack) {
        pack = pack || { transactions: [], total: 0 };
        var rows = (pack.transactions || []).map(function (t) {
          return '<div class="ka-li"><div class="ka-row-mid"><b>' + esc(t.display_name) + '</b><small>' + esc(t.username || t.phone || '') + ' · ' + esc(t.payment_method) + '</small></div><span class="ka-amt">' + fmt(t.amount) + '</span></div>';
        }).join('');
        return '<div class="ka-top"><button class="ka-back" data-go="home" aria-label="Back">‹</button><h1>Transactions</h1></div>' +
          guestBar('Log in to see deposits you have approved.') +
          '<div class="ka-card" style="padding:14px;margin-bottom:12px;"><div class="ka-muted">Approved total</div><div class="ka-amt" style="font-size:1.35rem;">' + fmt(pack.total) + '</div><p class="ka-muted">' + (pack.count || 0) + ' transactions</p></div>' +
          '<div class="ka-filters">' +
          chip('all') + chip('daily') + chip('weekly') + chip('monthly') +
          '</div><div class="ka-list">' + (rows || '<div class="ka-li">No approved transactions yet.</div>') + '</div>';
      },
      approvals: function (pack) {
        pack = pack || { requests: [] };
        var rows = (pack.requests || []).map(function (r) {
          var gap = Number(r.amount_on_track_gap) || 0;
          return '<article class="ka-card" style="padding:14px;margin-bottom:10px;">' +
            '<b>' + esc(r.display_name) + '</b>' +
            '<p class="ka-muted">' + esc(r.phone || 'No phone') + ' · @' + esc(r.username || 'member') + '</p>' +
            '<p class="ka-amt" style="margin:8px 0;">Approve ' + fmt(r.amount) + '</p>' +
            '<p class="ka-muted">On-track gap ' + fmt(Math.abs(gap)) + (gap >= 0 ? ' behind' : ' ahead') + '</p>' +
            '<label class="ka-check"><input type="checkbox" data-ack="' + esc(r.id) + '"> I understand I have verified receipt of this payment.</label>' +
            '<button class="ka-cta" data-approve="' + esc(r.id) + '">Approve</button></article>';
        }).join('');
        return '<div class="ka-top"><button class="ka-back" data-go="home" aria-label="Back">‹</button><h1>Approval requests</h1></div>' +
          guestBar('Log in to review cash and MoMo requests.') +
          (rows || empty('All clear', isReadyAdmin() ? 'Cash and MoMo requests from the KibbiSave app appear here.' : 'Pending requests show here after you sign in.'));
      },
      profile: function (pack) {
        pack = pack || {};
        if (!state.user) {
          return '<div class="ka-top"><h1>Profile</h1></div>' +
            '<div class="ka-card" style="padding:16px;margin-bottom:12px;">' +
            '<b>Community collector</b>' +
            '<p class="ka-muted" style="margin:8px 0 14px;">Log in to see your KYC, PIN settings, and approval track record.</p>' +
            '<button class="ka-cta" data-go="login">Log in</button>' +
            '<button class="ka-link" data-go="kyc">Create a collector account</button>' +
            '</div>';
        }
        var u = pack.user || state.user || {};
        var s = pack.stats || {};
        var acts = (pack.activity || []).map(function (a) {
          return '<div class="ka-li"><div class="ka-row-mid"><b>' + esc(a.action.replace(/_/g, ' ')) + '</b><small>' + new Date(a.created_at).toLocaleString() + '</small></div></div>';
        }).join('');
        return '<div class="ka-top"><h1>Profile</h1></div>' +
          guestBar() +
          '<div class="ka-card" style="padding:14px;margin-bottom:12px;display:flex;gap:12px;align-items:center;">' +
          (u.photoScanUrl ? '<img src="' + esc(u.photoScanUrl) + '" alt="" style="width:56px;height:56px;border-radius:16px;object-fit:cover;">' : '') +
          '<div><b>' + esc((u.firstName || '') + ' ' + (u.lastName || '')) + '</b><p class="ka-muted">' + (state.kycComplete ? 'KYC verified collector' : 'Finish KYC to approve deposits') + '</p></div></div>' +
          '<div class="ka-card" style="padding:14px;margin-bottom:12px;"><div class="ka-amt">' + fmt(s.total_collected) + '</div><p class="ka-muted">Track record · ' + Number(s.approved_count || 0) + ' approved</p></div>' +
          '<div class="ka-list">' +
          '<div class="ka-li"><div class="ka-row-mid"><b>Telephone</b><small>' + esc(u.phone) + '</small></div></div>' +
          '<div class="ka-li"><div class="ka-row-mid"><b>Email</b><small>' + esc(u.email) + '</small></div></div>' +
          '<div class="ka-li"><div class="ka-row-mid"><b>Address</b><small>' + esc(u.address) + '</small></div></div>' +
          '<div class="ka-li"><div class="ka-row-mid"><b>NIN</b><small>' + esc(u.nin) + '</small></div></div>' +
          '</div>' +
          '<div class="ka-section"><h2>Activity</h2><div class="ka-list">' + (acts || '<div class="ka-li">No activity yet.</div>') + '</div></div>' +
          '<button class="ka-link" id="ka-logout" style="margin-top:18px;">Sign out</button>';
      }
    };
  }

  function card(goTo, src, title) {
    return '<button type="button" class="ka-svc" data-go="' + goTo + '"><img src="' + src + '" alt=""><span>' + esc(title) + '</span></button>';
  }
  function chip(id) {
    return '<button type="button" class="ka-chip' + (state.txPeriod === id ? ' is-on' : '') + '" data-period="' + id + '">' + id + '</button>';
  }
  function empty(title, sub) {
    return '<div class="ka-empty"><img src="/assets/illustrations/svg/04-no-groups-empty.svg" alt=""><b>' + esc(title) + '</b><p>' + esc(sub) + '</p></div>';
  }

  function render(payload) {
    var map = screens();
    var fn = map[state.screen] || map.welcome;
    scroll.innerHTML = fn(payload);
    setDock(true);
    if (state.screen === 'kyc') {
      setTimeout(startCamera, 80);
      var passWrap = document.getElementById('kyc-pass-wrap');
      if (passWrap && state.user) passWrap.style.display = 'none';
    }
    bind();
  }

  function bind() {
    scroll.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () { route(el.getAttribute('data-go')); });
    });
    var loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.onclick = doLogin;
    var snap = document.getElementById('kyc-snap');
    if (snap) snap.onclick = function () {
      var photo = capturePhoto();
      if (!photo) return showMsg('kyc-error', 'Could not capture photo. Try again.');
      state.kycPhoto = photo;
      var preview = document.getElementById('kyc-preview');
      preview.src = photo;
      preview.style.display = 'block';
      showMsg('kyc-error', '');
    };
    var kycSubmit = document.getElementById('kyc-submit');
    if (kycSubmit) kycSubmit.onclick = doKyc;
    var toggle = document.getElementById('toggle-bal');
    if (toggle) toggle.onclick = function () {
      state.hiddenBalance = !state.hiddenBalance;
      route('home');
    };
    var amount = document.getElementById('reg-amount');
    var period = document.getElementById('reg-period');
    if (amount) amount.oninput = updateRate;
    if (period) period.onchange = updateRate;
    updateRate();
    var review = document.getElementById('reg-review');
    if (review) review.onclick = reviewMember;
    var regSubmit = document.getElementById('reg-submit');
    if (regSubmit) regSubmit.onclick = submitMember;
    var cc = document.getElementById('cc-submit');
    if (cc) cc.onclick = createCommunity;
    var search = document.getElementById('comm-search');
    if (search) search.oninput = debounce(searchMembers, 220);
    var memSearch = document.getElementById('mem-search');
    if (memSearch) memSearch.oninput = debounce(function () {
      loadCommunity(state.community.id, memSearch.value);
    }, 220);
    scroll.querySelectorAll('[data-open-community]').forEach(function (b) {
      b.onclick = function () { loadCommunity(b.getAttribute('data-open-community')); };
    });
    scroll.querySelectorAll('[data-open-member]').forEach(function (b) {
      b.onclick = function () { loadMember(b.getAttribute('data-open-member'), 'member-history'); };
    });
    scroll.querySelectorAll('[data-deposit-member]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        loadMember(b.getAttribute('data-deposit-member'), 'deposit');
      };
    });
    var depSubmit = document.getElementById('dep-submit');
    if (depSubmit) depSubmit.onclick = submitManualDeposit;
    scroll.querySelectorAll('[data-period]').forEach(function (b) {
      b.onclick = function () {
        state.txPeriod = b.getAttribute('data-period');
        route('transactions');
      };
    });
    scroll.querySelectorAll('[data-approve]').forEach(function (b) {
      b.onclick = function () { approveRequest(b.getAttribute('data-approve')); };
    });
    var logout = document.getElementById('ka-logout');
    if (logout) logout.onclick = function () {
      api('/auth/logout', { method: 'POST', body: {} }).finally(function () {
        state.user = null;
        state.kycComplete = false;
        state.communities = [];
        state.pendingCount = 0;
        go('home');
      });
    };
  }

  function updateRate() {
    var amount = Number((document.getElementById('reg-amount') || {}).value || 0);
    var months = Number((document.getElementById('reg-period') || {}).value || 12);
    var rate = document.getElementById('reg-rate');
    var end = document.getElementById('reg-end');
    if (rate && (!rate.dataset.touched || rate.value === '')) {
      rate.value = amount && months ? Math.round(amount / (months * 30)) : '';
    }
    if (rate) rate.oninput = function () { rate.dataset.touched = '1'; };
    if (end && months) {
      var d = new Date();
      d.setMonth(d.getMonth() + months);
      end.textContent = 'Ending ' + d.toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function route(name) {
    if (name === 'home') return loadHome();
    if (name === 'register') return loadCommunities().then(function () { go('register'); });
    if (name === 'communities') return loadCommunities().then(function () { go('communities'); });
    if (name === 'transactions') return loadTransactions();
    if (name === 'approvals') return loadApprovals();
    if (name === 'profile') return loadProfile();
    go(name);
  }

  function loadHome() {
    if (!isReadyAdmin()) {
      go('home');
      return Promise.resolve();
    }
    return api('/admin/home').then(function (r) {
      if (r.status === 403 && r.data.code === 'ADMIN_KYC_REQUIRED') {
        state.kycComplete = false;
        go('home');
        return;
      }
      if (!r.ok) {
        go('home');
        return;
      }
      state.pendingCount = r.data.pendingCount || 0;
      go('home');
      render(r.data);
    });
  }
  function loadCommunities() {
    if (!isReadyAdmin()) {
      state.communities = [];
      return Promise.resolve();
    }
    return api('/admin/communities').then(function (r) {
      state.communities = (r.ok && r.data && r.data.communities) ? r.data.communities : [];
    });
  }
  function searchMembers() {
    var q = document.getElementById('comm-search').value;
    api('/admin/communities?q=' + encodeURIComponent(q)).then(function (r) {
      var box = document.getElementById('comm-search-results');
      if (!box) return;
      var members = (r.ok && r.data && r.data.members) ? r.data.members : [];
      box.innerHTML = members.map(function (m) {
        return '<button class="ka-row" data-open-member="' + esc(m.id) + '"><div class="ka-row-mid"><b>' + esc(m.display_name) + '</b><small>' + esc(m.community_name) + '</small></div><span class="ka-amt">' + fmt(m.total_savings) + '</span></button>';
      }).join('');
      box.querySelectorAll('[data-open-member]').forEach(function (b) {
        b.onclick = function () { loadMember(b.getAttribute('data-open-member'), 'member-history'); };
      });
    });
  }
  function loadCommunity(id, q) {
    return api('/admin/communities/' + id + '/members' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function (r) {
      if (!r.ok) return;
      state.community = Object.assign({}, r.data.community, { members: r.data.members || [] });
      go('members');
    });
  }
  function loadMember(id, screen) {
    return api('/admin/members/' + id).then(function (r) {
      if (!r.ok) return;
      state.member = r.data;
      go(screen);
    });
  }
  function loadTransactions() {
    if (!isReadyAdmin()) {
      go('transactions');
      render({ transactions: [], total: 0, count: 0 });
      return Promise.resolve();
    }
    return api('/admin/transactions?period=' + encodeURIComponent(state.txPeriod)).then(function (r) {
      go('transactions');
      render(r.ok ? r.data : { transactions: [], total: 0, count: 0 });
    });
  }
  function loadApprovals() {
    if (!isReadyAdmin()) {
      state.pendingCount = 0;
      go('approvals');
      render({ requests: [], count: 0 });
      return Promise.resolve();
    }
    return api('/admin/approvals').then(function (r) {
      if (!r.ok) {
        go('approvals');
        render({ requests: [], count: 0 });
        return;
      }
      state.pendingCount = r.data.count || 0;
      go('approvals');
      render(r.data);
    });
  }
  function loadProfile() {
    if (!state.user) {
      go('profile');
      return Promise.resolve();
    }
    if (!isReadyAdmin()) {
      go('profile');
      return Promise.resolve();
    }
    return api('/admin/profile').then(function (r) {
      go('profile');
      if (r.ok) render(r.data);
    });
  }

  function doLogin() {
    showMsg('login-error', '');
    api('/admin/login', {
      method: 'POST',
      body: {
        identifier: document.getElementById('login-id').value,
        password: document.getElementById('login-pass').value
      }
    }).then(function (r) {
      if (!r.ok) return showMsg('login-error', r.data.error || 'Login failed');
      state.user = r.data.user;
      state.kycComplete = Boolean(r.data.kycComplete);
      var next = state.afterAuth;
      state.afterAuth = null;
      if (!state.kycComplete && (next === 'register' || next === 'register-confirm' || next === 'create-community' || next === 'deposit' || next === 'approvals')) {
        return go('kyc');
      }
      if (next && next !== 'login' && next !== 'welcome') return route(next);
      if (!state.kycComplete) return loadHome();
      loadHome();
    });
  }

  function doKyc() {
    showMsg('kyc-error', '');
    if (!state.kycPhoto) return showMsg('kyc-error', 'Scan your live face photo first.');
    var pin = String(document.getElementById('kyc-pin').value || '');
    if (!/^\d{4}$/.test(pin)) return showMsg('kyc-error', 'PIN must be 4 digits.');
    var payload = {
      firstName: document.getElementById('kyc-first').value,
      lastName: document.getElementById('kyc-last').value,
      email: document.getElementById('kyc-email').value,
      address: document.getElementById('kyc-address').value,
      phone: document.getElementById('kyc-phone').value,
      nin: document.getElementById('kyc-nin').value,
      password: document.getElementById('kyc-pass').value,
      pin: pin,
      photo: state.kycPhoto
    };
    var path = state.user ? '/admin/complete-kyc' : '/admin/register';
    api(path, { method: 'POST', body: payload }).then(function (r) {
      if (!r.ok) return showMsg('kyc-error', r.data.error || 'Could not save KYC');
      state.user = r.data.user;
      state.kycComplete = true;
      stopCamera();
      loadHome();
    });
  }

  function reviewMember() {
    if (!isReadyAdmin()) return needAuth('register');
    showMsg('reg-error', '');
    var communityId = document.getElementById('reg-community').value;
    var comm = (state.communities || []).filter(function (c) { return c.id === communityId; })[0];
    var draft = {
      firstName: document.getElementById('reg-first').value,
      lastName: document.getElementById('reg-last').value,
      username: document.getElementById('reg-user').value,
      password: document.getElementById('reg-pass').value,
      confirmPassword: document.getElementById('reg-pass2').value,
      nin: document.getElementById('reg-nin').value,
      periodMonths: Number(document.getElementById('reg-period').value),
      goalAmount: Number(document.getElementById('reg-amount').value),
      dailyRate: Number(document.getElementById('reg-rate').value),
      alreadyDeposited: Number(document.getElementById('reg-paid').value || 0),
      communityId: communityId,
      communityName: comm ? comm.name : ''
    };
    if (!draft.firstName || !draft.lastName) return showMsg('reg-error', 'Enter first and second name.');
    if (!draft.username) return showMsg('reg-error', 'Enter a username.');
    if (draft.password.length < 4) return showMsg('reg-error', 'Password must be at least 4 characters.');
    if (draft.password !== draft.confirmPassword) return showMsg('reg-error', 'Passwords do not match.');
    if (!draft.communityId) return showMsg('reg-error', 'Choose a community, or create one first.');
    state.registerDraft = draft;
    go('register-confirm');
  }

  function submitMember() {
    if (!isReadyAdmin()) return needAuth('register-confirm');
    askPin().then(function (pin) {
      if (!pin) return;
      var body = Object.assign({}, state.registerDraft, { pin: pin });
      api('/admin/members', { method: 'POST', body: body }).then(function (r) {
        if (!r.ok) {
          go('register-confirm');
          setTimeout(function () { showMsg('reg-error', r.data.error || 'Could not register'); }, 20);
          return;
        }
        var note = document.getElementById('reg-book');
        go('register-confirm');
        setTimeout(function () {
          var box = document.getElementById('reg-book');
          if (!box) return;
          box.hidden = false;
          box.innerHTML = '<b>Please write this down for the person on top of the book</b><div class="ka-cred">Username: ' +
            esc(r.data.writeDown.username) + '</div><div class="ka-cred">Password: ' +
            esc(state.registerDraft.password).replace(/./g, '•') + '</div><p>Shown once. ' +
            esc(state.registerDraft.password) + '</p>';
          showMsg('reg-error', '');
        }, 20);
      });
    });
  }

  function createCommunity() {
    if (!isReadyAdmin()) return needAuth('create-community');
    askPin().then(function (pin) {
      if (!pin) return;
      api('/admin/communities', {
        method: 'POST',
        body: { name: document.getElementById('cc-name').value, about: document.getElementById('cc-about').value, pin: pin }
      }).then(function (r) {
        if (!r.ok) return showMsg('cc-error', r.data.error || 'Could not create community');
        route('communities');
      });
    });
  }

  function submitManualDeposit() {
    if (!isReadyAdmin()) return needAuth('deposit');
    showMsg('dep-error', '');
    if (!document.getElementById('dep-ack').checked) return showMsg('dep-error', 'Confirm you received the money.');
    askPin().then(function (pin) {
      if (!pin) return;
      var id = state.member.member.id;
      api('/admin/members/' + id + '/deposits', {
        method: 'POST',
        body: {
          amount: Number(document.getElementById('dep-amt').value),
          acknowledged: true,
          pin: pin
        }
      }).then(function (r) {
        if (!r.ok) return showMsg('dep-error', r.data.error || 'Could not approve');
        loadCommunity(state.community.id);
      });
    });
  }

  function approveRequest(id) {
    if (!isReadyAdmin()) return needAuth('approvals');
    var box = document.querySelector('[data-ack="' + id + '"]');
    if (!box || !box.checked) return;
    askPin().then(function (pin) {
      if (!pin) return;
      api('/admin/approvals/' + id + '/approve', {
        method: 'POST',
        body: { pin: pin, acknowledged: true }
      }).then(function (r) {
        if (!r.ok) return;
        loadApprovals();
      });
    });
  }

  document.querySelectorAll('[data-pin]').forEach(function (input, idx, all) {
    input.addEventListener('input', function () {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && all[idx + 1]) all[idx + 1].focus();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !input.value && all[idx - 1]) all[idx - 1].focus();
    });
  });
  document.getElementById('pin-cancel').onclick = function () { closePin(null); };
  document.getElementById('pin-confirm').onclick = function () {
    var pin = pinValue();
    if (!/^\d{4}$/.test(pin)) return showMsg('pin-error', 'Enter all 4 digits.');
    closePin(pin);
  };
  dock.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { route(b.getAttribute('data-go')); });
  });

  var bannersTimer = setInterval(function () {
    var el = document.getElementById('ka-banners');
    if (!el || el.children.length < 2) return;
    el.scrollBy({ left: el.clientWidth * 0.7, behavior: 'smooth' });
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) el.scrollTo({ left: 0, behavior: 'smooth' });
  }, 4200);

  go('home');
  api('/admin/me').then(function (r) {
    if (r.ok && r.data.authenticated) {
      state.user = r.data.user;
      state.kycComplete = Boolean(r.data.kycComplete);
      return loadHome();
    }
    go('home');
  }).catch(function () { go('home'); });
})();
