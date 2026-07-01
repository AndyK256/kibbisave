(function () {
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

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderAvatar(picture, name) {
    var wrap = document.getElementById('profile-avatar');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (picture) {
      var img = document.createElement('img');
      img.src = picture;
      img.alt = '';
      if (!String(picture).startsWith('data:')) {
        img.referrerPolicy = 'no-referrer';
      }
      img.className = 'profile-avatar-img';
      wrap.appendChild(img);
    } else {
      wrap.textContent = initials(name);
    }
  }

  function setAvatarHint(message, type) {
    var hint = document.getElementById('profile-avatar-hint');
    if (!hint) return;
    hint.textContent = message || '';
    hint.classList.remove('is-error', 'is-ok');
    if (type === 'error') hint.classList.add('is-error');
    if (type === 'ok') hint.classList.add('is-ok');
  }

  function resizeAvatarFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        reject(new Error('INVALID_TYPE'));
        return;
      }

      var img = new Image();
      var objectUrl = URL.createObjectURL(file);

      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var size = 320;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        var min = Math.min(img.width, img.height);
        var sx = (img.width - min) / 2;
        var sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };

      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('INVALID_IMAGE'));
      };

      img.src = objectUrl;
    });
  }

  function uploadAvatar(dataUrl) {
    var btn = document.getElementById('profile-avatar-btn');
    if (btn) btn.disabled = true;
    setAvatarHint('Uploading photo…', null);

    return fetch('/api/profile/avatar', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.body.error || 'Upload failed');
        }
        return result.body;
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function wireAvatarUpload(getName) {
    var btn = document.getElementById('profile-avatar-btn');
    var input = document.getElementById('profile-avatar-input');
    if (!btn || !input || btn.dataset.wired) return;
    btn.dataset.wired = '1';

    btn.addEventListener('click', function () {
      input.click();
    });

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;

      resizeAvatarFile(file)
        .then(function (dataUrl) {
          renderAvatar(dataUrl, getName());
          return uploadAvatar(dataUrl);
        })
        .then(function (data) {
          renderAvatar(data.picture, getName());
          setAvatarHint('Photo saved', 'ok');
        })
        .catch(function (err) {
          setAvatarHint(err.message || 'Could not save photo', 'error');
          loadProfile();
        });
    });
  }

  var currentProfileName = '';

  function renderActivity(items) {
    var list = document.getElementById('profile-activity-list');
    var empty = document.getElementById('profile-activity-empty');
    if (!list) return;

    list.innerHTML = '';
    if (!items || !items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    items.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'act-row';
      row.innerHTML =
        '<div class="act-icon" style="background:#f0f2ff;">' +
        '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#00008b" stroke-width="2" stroke-linecap="round">' +
        '<circle cx="12" cy="12" r="10"/></svg></div>' +
        '<div class="act-info"><div class="act-title">' +
        item.title +
        '</div><div class="act-sub">' +
        (item.sub || '') +
        '</div></div>' +
        '<div class="act-right"><div class="act-amt">' +
        (item.amount || '') +
        '</div><div class="act-date">' +
        (item.date || '') +
        '</div></div>';
      list.appendChild(row);
    });
  }

  function renderBadges(badges) {
    var row = document.getElementById('profile-badges-row');
    if (!row || !badges) return;

    row.querySelectorAll('.badge-card').forEach(function (card) {
      var id = card.getAttribute('data-badge');
      var badge = badges.find(function (b) {
        return b.id === id;
      });
      if (!badge) return;
      card.classList.toggle('locked', !badge.unlocked);
    });
  }

  function hideLoading() {
    var el = document.getElementById('profile-loading');
    if (el) el.hidden = true;
  }

  function showGuest() {
    hideLoading();
    var guest = document.getElementById('profile-guest');
    var app = document.getElementById('profile-app');
    var signout = document.querySelector('.signout');
    if (guest) guest.hidden = false;
    if (app) app.hidden = true;
    if (signout) signout.hidden = true;
  }

  function showProfile(data) {
    hideLoading();
    var guest = document.getElementById('profile-guest');
    var app = document.getElementById('profile-app');
    var signout = document.querySelector('.signout');
    if (guest) guest.hidden = true;
    if (app) app.hidden = false;
    if (signout) signout.hidden = false;

    var user = data.user;
    var stats = data.stats;

    currentProfileName = user.name;
    wireAvatarUpload(function () {
      return currentProfileName;
    });

    renderAvatar(user.picture, user.name);
    setText('profile-name', user.name);
    setText(
      'profile-handle',
      user.handle + ' · ' + (user.location || 'Uganda')
    );
    setText('profile-member', user.memberSince);
    setText('profile-menu-email', user.email || 'Signed in with Google');

    setText('profile-stat-groups', String(stats.groups));
    setText('profile-stat-causes', String(stats.causes));
    setText('profile-stat-streak', stats.streakLabel);

    setText('profile-total-saved', stats.totalSavedLabel.replace(/^UGX\s*/, ''));
    setText('profile-total-saved-sub', stats.totalSavedSub);
    setText('profile-interest', stats.interestLabel.replace(/^UGX\s*/, ''));
    setText('profile-interest-sub', stats.interestSub);
    setText('profile-best-rank', stats.bestRank);
    setText('profile-best-rank-sub', stats.bestRankSub);
    setText('profile-avg-lead', stats.avgLead);
    setText('profile-avg-lead-sub', stats.avgLeadSub);

    renderBadges(data.badges);
    renderActivity(data.activity);

    document.title = user.name + ' — KibbiSave Profile';
  }

  function loadProfile() {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (auth) {
        if (!auth.authenticated) {
          showGuest();
          return null;
        }
        return fetch('/api/profile', { credentials: 'include' });
      })
      .then(function (r) {
        if (!r) return;
        if (r.status === 401) {
          showGuest();
          return null;
        }
        return r.json();
      })
      .then(function (data) {
        if (data && data.user) showProfile(data);
      })
      .catch(function () {
        showGuest();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProfile);
  } else {
    loadProfile();
  }
})();
