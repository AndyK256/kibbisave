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

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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

  var currentProfile = null;
  var currentProfileName = '';

  function hideSkeleton() {
    var el = document.getElementById('profile-skeleton');
    if (el) {
      el.hidden = true;
      el.setAttribute('hidden', '');
      el.classList.add('is-hidden');
      el.setAttribute('aria-busy', 'false');
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('display', 'none', 'important');
    }
    var legacy = document.getElementById('profile-loading');
    if (legacy) legacy.hidden = true;
  }

  function isEmbed() {
    try {
      if (document.documentElement.classList.contains('kb-embed')) return true;
      if (/(?:^|[?&])embed=1(?:&|$)/.test(window.location.search || '')) return true;
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  function returnAfterFlowUrl() {
    try {
      var ret = sessionStorage.getItem('kb_profile_return');
      if (ret) return ret;
    } catch (e) {}
    return 'kibbisave_home_final.html';
  }

  function presentProfileSheet() {
    var app = document.getElementById('profile-app');
    if (!app) return;

    // Embed mode: parent page stays alive under an iframe overlay
    if (isEmbed()) {
      document.documentElement.classList.add('kb-embed');
      document.body.classList.add('kb-embed');
      var sk = document.getElementById('profile-skeleton');
      if (sk) {
        sk.hidden = true;
        sk.setAttribute('hidden', '');
      }
      app.hidden = false;
      app.removeAttribute('hidden');
      app.style.removeProperty('display');
      ensureEmbedClose();
      return;
    }

    // Hide chrome immediately so top/bottom bars never flash under the sheet
    document.documentElement.classList.add('kb-profile-boot', 'kb-profile-sheet-open');
    document.body.classList.add('kb-profile-sheet-open');

    var sheet = document.getElementById('kb-profile-sheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.id = 'kb-profile-sheet';
      sheet.className = 'kb-profile-sheet';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.setAttribute('aria-label', 'Profile');
      sheet.innerHTML =
        '<div class="kb-profile-sheet-bar">' +
          '<button type="button" class="kb-profile-sheet-close" data-kb-profile-close aria-label="Close profile">×</button>' +
        '</div>' +
        '<div class="kb-profile-sheet-scroll" data-kb-profile-scroll></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener('click', function (e) {
        if (e.target.closest('[data-kb-profile-close]')) {
          e.preventDefault();
          closeProfileSheet();
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && sheet.classList.contains('is-open')) closeProfileSheet();
      });
    }
    var scroll = sheet.querySelector('[data-kb-profile-scroll]');
    if (scroll && app.parentNode !== scroll) {
      scroll.appendChild(app);
    }
    app.hidden = false;
    app.removeAttribute('hidden');
    app.style.removeProperty('display');
    requestAnimationFrame(function () {
      sheet.classList.add('is-open');
    });
  }

  function ensureEmbedClose() {
    if (document.getElementById('kb-embed-close')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'kb-embed-close';
    btn.className = 'kb-embed-close';
    btn.setAttribute('aria-label', 'Close profile');
    btn.textContent = '×';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      closeProfileSheet();
    });
    document.body.insertBefore(btn, document.body.firstChild);
    if (!document.documentElement.dataset.embedEscWired) {
      document.documentElement.dataset.embedEscWired = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isEmbed()) closeProfileSheet();
      });
    }
    if (!document.documentElement.dataset.embedNavWired) {
      document.documentElement.dataset.embedNavWired = '1';
      document.addEventListener(
        'click',
        function (e) {
          if (!isEmbed()) return;
          var a = e.target.closest('a[href]');
          if (!a) return;
          var href = a.getAttribute('href') || '';
          if (!/kibbisave_deposit|kibbisave_create_group|kibbisave_join_group/i.test(href)) return;
          e.preventDefault();
          try {
            window.parent.postMessage({ type: 'kb-profile-navigate', href: href }, '*');
          } catch (err) {
            window.location.href = href;
          }
        },
        true
      );
    }
    if (!document.documentElement.dataset.embedResetWired) {
      document.documentElement.dataset.embedResetWired = '1';
      window.addEventListener('message', function (e) {
        if (!e || !e.data || e.data.type !== 'kb-profile-reset') return;
        closePersonalFolder();
        closeFolder();
        closeActivityFolder();
        closePanel();
        var main = document.querySelector('.site-main--profile') || document.scrollingElement;
        if (main && typeof main.scrollTop === 'number') main.scrollTop = 0;
        var appScroll = document.querySelector('.kb-app-scroll');
        if (appScroll) appScroll.scrollTop = 0;
        window.scrollTo(0, 0);
      });
    }
  }

  function closeProfileSheet() {
    if (isEmbed()) {
      try {
        window.parent.postMessage({ type: 'kb-profile-close' }, '*');
      } catch (e) {}
      return;
    }
    var sheet = document.getElementById('kb-profile-sheet');
    if (sheet) sheet.classList.remove('is-open');
    document.body.classList.remove('kb-profile-sheet-open');
    document.documentElement.classList.remove('kb-profile-sheet-open', 'kb-profile-boot');
    window.setTimeout(function () {
      window.location.href = returnAfterFlowUrl();
    }, 280);
  }

  window.KibbiProfileSheet = {
    open: presentProfileSheet,
    close: closeProfileSheet
  };

  function revealProfileApp() {
    var app = document.getElementById('profile-app');
    var main = document.querySelector('.site-main--profile');
    var wrap = main && main.querySelector('.wrap');
    if (app) {
      app.hidden = false;
      app.removeAttribute('hidden');
      app.removeAttribute('aria-hidden');
      app.style.removeProperty('display');
    }
    if (wrap) {
      wrap.hidden = false;
      wrap.removeAttribute('hidden');
    }
    if (main) {
      main.classList.remove('is-guest');
      main.classList.add('is-ready');
    }
    presentProfileSheet();
  }

  function showGuest() {
    hideSkeleton();
    closeFolder();
    closeActivityFolder();
    closePersonalFolder();
    document.documentElement.classList.remove('kb-profile-boot', 'kb-profile-sheet-open');
    document.body.classList.remove('kb-profile-sheet-open');
    var sheet = document.getElementById('kb-profile-sheet');
    if (sheet) {
      sheet.classList.remove('is-open');
      sheet.style.display = 'none';
    }
    var app = document.getElementById('profile-app');
    var main = document.querySelector('.site-main--profile');
    var wrap = main && main.querySelector('.wrap');
    var signout = document.querySelector('.signout');
    if (app) {
      app.hidden = true;
      app.setAttribute('hidden', '');
      app.style.setProperty('display', 'none', 'important');
    }
    if (wrap) {
      wrap.hidden = false;
      wrap.removeAttribute('hidden');
      wrap.innerHTML =
        '<div class="kb-profile-guest-placeholder">' +
          '<p>Join or log in to open your KibbiSave profile, groups, and deposits.</p>' +
        '</div>';
    }
    if (main) {
      main.classList.add('is-guest');
      main.classList.remove('is-ready');
    }
    if (signout) signout.hidden = true;
    if (window.KibbiGuestAccount && typeof window.KibbiGuestAccount.open === 'function') {
      window.KibbiGuestAccount.open({ closeGoesHome: true });
    }
  }

  function showError(message) {
    hideSkeleton();
    closeFolder();
    closeActivityFolder();
    closePersonalFolder();
    var app = document.getElementById('profile-app');
    var main = document.querySelector('.site-main--profile');
    var wrap = main && main.querySelector('.wrap');
    if (app) {
      app.hidden = true;
      app.setAttribute('hidden', '');
      app.style.setProperty('display', 'none', 'important');
    }
    if (wrap) {
      wrap.hidden = false;
      wrap.innerHTML =
        '<div class="profile-loading"><p>' +
        esc(message || 'Could not load your profile. Refresh to retry.') +
        '</p></div>';
    }
    if (main) {
      main.classList.remove('is-guest');
      main.classList.remove('is-ready');
    }
  }

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
        esc(item.title) +
        '</div><div class="act-sub">' +
        esc(item.sub || '') +
        '</div></div>' +
        '<div class="act-right"><div class="act-amt">' +
        esc(item.amount || '') +
        '</div><div class="act-date">' +
        esc(item.date || '') +
        '</div></div>';
      list.appendChild(row);
    });
  }

  function fmtMembers(n) {
    var count = Number(n) || 0;
    return count + (count === 1 ? ' member' : ' members');
  }

  function lifeStatus(item) {
    var raw = String(item && (item.life_status || item.status) || 'alive').toLowerCase();
    if (raw === 'dead' || raw === 'completed' || raw === 'expired' || raw === 'finished' || raw === 'closed' || raw === 'done') {
      return 'dead';
    }
    return 'alive';
  }

  function canDeleteItem(item) {
    if (!item) return false;
    if (item.can_delete === true || item.can_delete === 't' || item.can_delete === 'true') return true;
    if (item.can_delete === false || item.can_delete === 'f' || item.can_delete === 'false') return false;
    return Boolean(item.is_creator) && lifeStatus(item) === 'alive';
  }

  function lifeBadgeHtml(status) {
    var alive = status === 'alive';
    return (
      '<span class="life-badge ' +
      (alive ? 'alive' : 'finished') +
      '">' +
      (alive ? 'Alive' : 'Finished') +
      '</span>'
    );
  }

  function wireDeleteButtons(list, opts) {
    list.querySelectorAll('.created-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var id = btn.getAttribute('data-id');
        var name = btn.getAttribute('data-name') || opts.fallbackName;
        if (!id) return;
        if (!window.confirm(opts.confirm(name))) return;
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        fetch(opts.url(id), {
          method: 'DELETE',
          credentials: 'include',
        })
          .then(function (r) {
            return r.json().then(function (body) {
              return { ok: r.ok, body: body };
            });
          })
          .then(function (res) {
            if (!res.ok) throw new Error(res.body.error || 'Delete failed');
            opts.reload();
          })
          .catch(function (err) {
            btn.disabled = false;
            btn.textContent = 'Delete';
            window.alert(err.message || opts.failMsg);
          });
      });
    });
  }

  function setCreatedTab(key) {
    var tabs = document.querySelectorAll('[data-created-tab]');
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-created-tab') === key;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var communities = document.getElementById('profile-created-communities');
    var groups = document.getElementById('profile-created-groups');
    if (communities) communities.hidden = key !== 'communities';
    if (groups) groups.hidden = key !== 'groups';
  }

  function wireCreatedTabs() {
    var tabs = document.querySelectorAll('[data-created-tab]');
    if (!tabs.length) return;
    tabs.forEach(function (tab) {
      if (tab.dataset.wired) return;
      tab.dataset.wired = '1';
      tab.addEventListener('click', function () {
        setCreatedTab(tab.getAttribute('data-created-tab'));
      });
    });
  }

  function openFolder() {
    var screen = document.getElementById('profile-folder-screen');
    if (!screen) return;
    screen.hidden = false;
    screen.removeAttribute('hidden');
    screen.style.removeProperty('display');
    setCreatedTab('communities');
    loadCreatedByMe();
    var back = document.getElementById('profile-folder-close');
    if (back) back.focus();
  }

  function closeFolder() {
    var screen = document.getElementById('profile-folder-screen');
    if (!screen) return;
    screen.hidden = true;
    screen.setAttribute('hidden', '');
    screen.style.setProperty('display', 'none', 'important');
  }

  function wireFolder() {
    var openBtn = document.getElementById('profile-folder-open');
    var closeBtn = document.getElementById('profile-folder-close');
    if (openBtn && !openBtn.dataset.folderWired) {
      openBtn.dataset.folderWired = '1';
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openFolder();
      });
      openBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFolder();
        }
      });
    }
    if (closeBtn && !closeBtn.dataset.folderWired) {
      closeBtn.dataset.folderWired = '1';
      closeBtn.addEventListener('click', closeFolder);
    }
    if (!document.documentElement.dataset.folderEscWired) {
      document.documentElement.dataset.folderEscWired = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var personal = document.getElementById('profile-personal-screen');
        if (personal && !personal.hidden) {
          closePersonalFolder();
          return;
        }
        var activity = document.getElementById('profile-activity-screen');
        if (activity && !activity.hidden) {
          closeActivityFolder();
          return;
        }
        var screen = document.getElementById('profile-folder-screen');
        if (screen && !screen.hidden) closeFolder();
      });
    }
  }

  function loadCreatedCommunities() {
    var list = document.getElementById('profile-created-list');
    var empty = document.getElementById('profile-created-empty');
    var sec = document.getElementById('profile-created-sec');
    if (!list || !sec) return;

    list.innerHTML = '<div class="created-empty">Loading…</div>';
    if (empty) empty.hidden = true;

    fetch('/api/communities/mine', { credentials: 'include' })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Failed');
        var communities = res.body.communities || [];
        list.innerHTML = '';
        if (!communities.length) {
          if (empty) {
            empty.hidden = false;
            empty.textContent = 'No communities in your history yet.';
          }
          return;
        }
        if (empty) empty.hidden = true;
        communities.forEach(function (c) {
          var status = lifeStatus(c);
          var allowDelete = canDeleteItem(c) && status === 'alive';
          var role = c.is_creator ? 'Created' : 'Joined';
          var row = document.createElement('div');
          row.className = 'created-row' + (status === 'dead' ? ' is-dead' : '');
          row.innerHTML =
            '<div class="created-icon">' +
            esc(c.icon || '👥') +
            '</div>' +
            '<div class="created-info">' +
            '<div class="created-name">' +
            esc(c.name || 'Community') +
            '</div>' +
            '<div class="created-sub">' +
            lifeBadgeHtml(status) +
            '<span>' +
            esc(role) +
            ' · ' +
            esc(fmtMembers(c.total_members)) +
            (c.is_public === false ? ' · Private' : ' · Public') +
            '</span></div></div>' +
            '<button type="button" class="created-del" data-id="' +
            esc(c.id) +
            '" data-name="' +
            esc(c.name || 'this community') +
            '"' +
            (allowDelete ? '' : ' disabled') +
            '>Delete</button>';
          list.appendChild(row);
        });

        wireDeleteButtons(list, {
          fallbackName: 'this community',
          confirm: function (name) {
            return (
              'Delete "' +
              name +
              '"? This removes the community and all memberships. This cannot be undone.'
            );
          },
          url: function (id) {
            return '/api/communities/' + encodeURIComponent(id);
          },
          reload: loadCreatedCommunities,
          failMsg: 'Could not delete community',
        });
      })
      .catch(function () {
        list.innerHTML = '';
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'Could not load your communities.';
        }
      });
  }

  function loadCreatedGroups() {
    var list = document.getElementById('profile-created-groups-list');
    var empty = document.getElementById('profile-created-groups-empty');
    if (!list) return;

    list.innerHTML = '<div class="created-empty">Loading…</div>';
    if (empty) empty.hidden = true;

    fetch('/api/groups/mine', { credentials: 'include' })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'Failed');
        var groups = res.body.groups || [];
        list.innerHTML = '';
        if (!groups.length) {
          if (empty) {
            empty.hidden = false;
            empty.textContent = 'No groups in your history yet.';
          }
          return;
        }
        if (empty) empty.hidden = true;
        groups.forEach(function (g) {
          var status = lifeStatus(g);
          var allowDelete = canDeleteItem(g) && status === 'alive';
          var role = g.is_creator ? 'Created' : 'Joined';
          var row = document.createElement('div');
          row.className = 'created-row' + (status === 'dead' ? ' is-dead' : '');
          row.innerHTML =
            '<div class="created-icon">💰</div>' +
            '<div class="created-info">' +
            '<div class="created-name">' +
            esc(g.name || g.code || 'Group') +
            '</div>' +
            '<div class="created-sub">' +
            lifeBadgeHtml(status) +
            '<span>' +
            esc(role) +
            ' · ' +
            esc(fmtMembers(g.current_members)) +
            (g.is_private ? ' · Private' : ' · Public') +
            (g.period_months ? ' · ' + g.period_months + ' mo' : '') +
            '</span></div></div>' +
            '<button type="button" class="created-del" data-id="' +
            esc(g.id) +
            '" data-name="' +
            esc(g.name || g.code || 'this group') +
            '"' +
            (allowDelete ? '' : ' disabled') +
            '>Delete</button>';
          list.appendChild(row);
        });

        wireDeleteButtons(list, {
          fallbackName: 'this group',
          confirm: function (name) {
            return (
              'Delete "' +
              name +
              '"? This removes the group and its memberships. This cannot be undone.'
            );
          },
          url: function (id) {
            return '/api/groups/' + encodeURIComponent(id);
          },
          reload: loadCreatedGroups,
          failMsg: 'Could not delete group',
        });
      })
      .catch(function () {
        list.innerHTML = '';
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'Could not load your groups.';
        }
      });
  }

  function loadCreatedByMe() {
    wireCreatedTabs();
    wireFolder();
    loadCreatedCommunities();
    loadCreatedGroups();
  }

  var SETTINGS_KEY = 'kibbi_app_settings_v1';

  function readLocalSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeLocalSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {}));
    } catch (e) {}
  }

  function isLocalDark() {
    if (window.KibbiTheme && window.KibbiTheme.isDark) return window.KibbiTheme.isDark();
    try {
      return localStorage.getItem('kibbi_dark_mode') === '1';
    } catch (e) {
      return false;
    }
  }

  function applyDark(on) {
    if (window.KibbiTheme && window.KibbiTheme.setDark) {
      window.KibbiTheme.setDark(on);
      return;
    }
    document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', on);
    if (document.body) document.body.classList.toggle('dark', on);
    try {
      localStorage.setItem('kibbi_dark_mode', on ? '1' : '0');
    } catch (e) {}
  }

  function toggleRowHtml(name, id, label, checked) {
    return (
      '<label class="kb-toggle-row">' +
      '<span>' +
      esc(label) +
      '</span><span class="kb-toggle"><input type="checkbox" name="' +
      esc(name) +
      '" id="' +
      esc(id) +
      '"' +
      (checked ? ' checked' : '') +
      '><span class="kb-toggle-track" aria-hidden="true"></span></span></label>'
    );
  }

  function ensurePanel() {
    var panel = document.getElementById('profile-panel');
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'profile-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'presentation');
    panel.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:520;display:none;align-items:flex-end;justify-content:center;padding:16px;';
    panel.innerHTML =
      '<div id="profile-panel-card" role="dialog" aria-modal="true" aria-labelledby="profile-panel-title" style="width:min(420px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:18px;padding:18px 16px 16px;box-shadow:0 18px 50px rgba(0,0,56,0.18);">' +
      '<div class="kb-card-head" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">' +
      '<div id="profile-panel-title" style="font-size:15px;font-weight:700;color:#111;">Details</div>' +
      '<button type="button" id="profile-panel-close" class="kb-card-close" aria-label="Close">×</button>' +
      '</div><div id="profile-panel-body"></div></div>';
    document.body.appendChild(panel);

    function onBackdrop(e) {
      if (e.target === panel) closePanel();
    }
    panel.addEventListener('click', onBackdrop);
    panel.addEventListener('mousedown', onBackdrop);
    panel.addEventListener('touchstart', onBackdrop, { passive: true });

    var card = document.getElementById('profile-panel-card');
    if (card) {
      card.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      card.addEventListener('mousedown', function (e) {
        e.stopPropagation();
      });
    }
    document.getElementById('profile-panel-close').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    });

    if (!document.documentElement.dataset.panelEscWired) {
      document.documentElement.dataset.panelEscWired = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var p = document.getElementById('profile-panel');
        if (p && !p.hidden) closePanel();
      });
    }
    return panel;
  }

  function openPanel(title, html) {
    var panel = ensurePanel();
    document.getElementById('profile-panel-title').textContent = title;
    document.getElementById('profile-panel-body').innerHTML = html;
    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.style.setProperty('display', 'flex', 'important');
  }

  function closePanel() {
    var panel = document.getElementById('profile-panel');
    if (!panel) return;
    panel.hidden = true;
    panel.setAttribute('hidden', '');
    panel.style.setProperty('display', 'none', 'important');
  }

  function providerLabel(p) {
    if (p === 'mtn_momo') return 'MTN MoMo';
    if (p === 'airtel') return 'Airtel Money';
    if (p === 'bank') return 'Bank account';
    return p || 'Payment';
  }

  function openPersonalDetails() {
    var screen = document.getElementById('profile-personal-screen');
    var u = (currentProfile && currentProfile.user) || {};
    var nameEl = document.getElementById('pd-display-name');
    var phoneEl = document.getElementById('pd-phone');
    var locEl = document.getElementById('pd-location');
    var emailEl = document.getElementById('pd-email');
    var form = document.getElementById('pd-form');
    if (nameEl) nameEl.value = u.name || '';
    if (phoneEl) phoneEl.value = u.phone || '';
    if (locEl) locEl.value = u.location || 'Uganda';
    if (emailEl) emailEl.value = u.email || '';
    if (screen) {
      screen.hidden = false;
      screen.removeAttribute('hidden');
      screen.style.removeProperty('display');
      var back = document.getElementById('profile-personal-close');
      if (back) back.focus();
    }
    if (!form || form.dataset.wired === '1') return;
    form.dataset.wired = '1';

    var saveTimer = null;
    var lastPayload = '';

    function savePersonal(opts) {
      opts = opts || {};
      var fd = new FormData(form);
      var msg = document.getElementById('pd-msg');
      var payload = {
        display_name: String(fd.get('display_name') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        location: String(fd.get('location') || '').trim(),
      };
      if (!payload.display_name) {
        if (msg) {
          msg.textContent = 'Name is required';
          msg.style.color = '#a32d2d';
        }
        return;
      }
      var key = JSON.stringify(payload);
      if (key === lastPayload && !opts.force) return;
      lastPayload = key;
      if (msg) {
        msg.textContent = 'Saving…';
        msg.style.color = '#7a85a0';
      }
      fetch('/api/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (b) {
            return { ok: r.ok, body: b };
          });
        })
        .then(function (res) {
          if (!res.ok) throw new Error(res.body.error || 'Save failed');
          if (msg) {
            msg.textContent = 'Saved';
            msg.style.color = '#1a6e35';
          }
          if (currentProfile && currentProfile.user) {
            currentProfile.user.name = res.body.user.name || payload.display_name;
            currentProfile.user.phone = res.body.user.phone;
            currentProfile.user.location = res.body.user.location || payload.location;
            currentProfileName = currentProfile.user.name;
            setText('profile-name', currentProfile.user.name);
            setText(
              'profile-handle',
              (currentProfile.user.handle || '') +
                ' · ' +
                (currentProfile.user.location || 'Uganda')
            );
            setText('profile-menu-email', currentProfile.user.email || 'Name, phone, location');
          } else {
            loadProfile();
          }
        })
        .catch(function (err) {
          lastPayload = '';
          if (msg) {
            msg.textContent = err.message || 'Could not save';
            msg.style.color = '#a32d2d';
          }
        });
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        savePersonal();
      }, 450);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (saveTimer) clearTimeout(saveTimer);
      savePersonal({ force: true });
    });
    form.querySelectorAll('input:not([disabled])').forEach(function (input) {
      input.addEventListener('blur', function () {
        if (saveTimer) clearTimeout(saveTimer);
        savePersonal();
      });
      input.addEventListener('change', scheduleSave);
      input.addEventListener('input', scheduleSave);
    });
  }

  function closePersonalFolder() {
    var screen = document.getElementById('profile-personal-screen');
    if (!screen) return;
    screen.hidden = true;
    screen.setAttribute('hidden', '');
    screen.style.setProperty('display', 'none', 'important');
  }

  function openPaymentMethods() {
    openPanel('Payment methods', '<p style="font-size:12px;color:#7a85a0;">Loading…</p>');
    fetch('/api/profile/payment-methods', { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var methods = d.methods || [];
        var list =
          methods
            .map(function (m) {
              return (
                '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid #eef0f8;border-radius:12px;padding:10px 12px;margin-bottom:8px;">' +
                '<div><div style="font-size:13px;font-weight:600;">' +
                esc(providerLabel(m.provider)) +
                (m.is_default ? ' · default' : '') +
                '</div><div style="font-size:11px;color:#7a85a0;">' +
                esc(m.label || m.account_ref) +
                '</div></div>' +
                '<button type="button" data-del="' +
                esc(m.id) +
                '" style="border:none;background:#fdecea;color:#a32d2d;border-radius:8px;padding:6px 10px;font:inherit;font-size:11px;cursor:pointer;">Remove</button></div>'
              );
            })
            .join('') ||
          '<div style="font-size:12px;color:#7a85a0;margin-bottom:12px;">No payment methods yet.</div>';

        openPanel(
          'Payment methods',
          list +
            '<form id="pm-form" style="display:grid;gap:8px;margin-top:8px;border-top:1px solid #eef0f8;padding-top:12px;">' +
            '<select name="provider" style="padding:10px 12px;border:1px solid #dde3f0;border-radius:10px;font:inherit;">' +
            '<option value="mtn_momo">MTN MoMo</option><option value="airtel">Airtel Money</option><option value="bank">Bank</option></select>' +
            '<input name="account_ref" required placeholder="Phone or account number" style="padding:10px 12px;border:1px solid #dde3f0;border-radius:10px;font:inherit;">' +
            '<input name="label" placeholder="Label (optional)" style="padding:10px 12px;border:1px solid #dde3f0;border-radius:10px;font:inherit;">' +
            '<label style="font-size:12px;color:#374057;"><input type="checkbox" name="is_default"> Set as default</label>' +
            '<button type="submit" class="pm-add-btn">Add method</button>' +
            '<p id="pm-msg" style="font-size:11px;color:#7a85a0;min-height:16px;"></p></form>'
        );

        document.querySelectorAll('[data-del]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            fetch('/api/profile/payment-methods/' + btn.getAttribute('data-del'), {
              method: 'DELETE',
              credentials: 'include',
            }).then(function () {
              openPaymentMethods();
            });
          });
        });

        document.getElementById('pm-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(e.target);
          var msg = document.getElementById('pm-msg');
          msg.textContent = 'Saving…';
          fetch('/api/profile/payment-methods', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: fd.get('provider'),
              account_ref: fd.get('account_ref'),
              label: fd.get('label'),
              is_default: fd.get('is_default') === 'on',
            }),
          })
            .then(function (r) {
              return r.json().then(function (b) {
                return { ok: r.ok, body: b };
              });
            })
            .then(function (res) {
              if (!res.ok) throw new Error(res.body.error || 'Save failed');
              openPaymentMethods();
            })
            .catch(function (err) {
              msg.textContent = err.message || 'Could not save';
              msg.style.color = '#a32d2d';
            });
        });
      })
      .catch(function () {
        openPanel('Payment methods', '<p style="color:#a32d2d;font-size:12px;">Could not load payment methods.</p>');
      });
  }

  function openHistory() {
    openPanel('Savings history', '<p style="font-size:12px;color:#7a85a0;">Loading…</p>');
    fetch('/api/profile/history', { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var rows = d.history || [];
        if (!rows.length) {
          openPanel(
            'Savings history',
            '<p style="font-size:12px;color:#7a85a0;">No deposits yet. Join a group and make your first deposit.</p>'
          );
          return;
        }
        openPanel(
          'Savings history',
          rows
            .map(function (item) {
              return (
                '<div style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eef0f8;padding:10px 0;">' +
                '<div><div style="font-size:13px;font-weight:600;">' +
                esc(item.title) +
                '</div><div style="font-size:11px;color:#7a85a0;">' +
                esc(item.sub || '') +
                ' · ' +
                esc(item.date || '') +
                '</div></div><div style="font-size:13px;font-weight:600;color:#00008b;">' +
                esc(item.amount || '') +
                '</div></div>'
              );
            })
            .join('')
        );
      })
      .catch(function () {
        openPanel('Savings history', '<p style="color:#a32d2d;font-size:12px;">Could not load history.</p>');
      });
  }

  function openNotifications() {
    openPanel('Notifications', '<p style="font-size:12px;color:#7a85a0;">Loading…</p>');
    fetch('/api/profile/notifications', { credentials: 'include' })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var rows = d.notifications || [];
        if (!rows.length) {
          openPanel(
            'Notifications',
            '<div class="kb-notif-empty" style="text-align:center;padding:12px 8px;"><img class="kb-illus" src="/assets/illustrations/svg/18-no-notifications.svg" alt="Character beside a sleeping bell" width="160" height="160" decoding="async"><p style="font-size:12px;color:#7a85a0;margin-top:8px;">You\'re all caught up. Deposits and rank updates will show here.</p></div>'
          );
          return;
        }
        openPanel(
          'Notifications',
          rows
            .map(function (n) {
              return (
                '<div data-nid="' +
                esc(n.id) +
                '" style="border:1px solid #eef0f8;border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer;background:' +
                (n.is_read ? '#fff' : '#f4f6fb') +
                ';">' +
                '<div style="font-size:13px;font-weight:600;">' +
                esc(n.title) +
                '</div><div style="font-size:11px;color:#7a85a0;margin-top:3px;">' +
                esc(n.body) +
                '</div></div>'
              );
            })
            .join('')
        );
        document.querySelectorAll('[data-nid]').forEach(function (el) {
          el.addEventListener('click', function () {
            fetch('/api/profile/notifications/' + el.getAttribute('data-nid') + '/read', {
              method: 'PATCH',
              credentials: 'include',
            }).then(function () {
              el.style.background = '#fff';
            });
          });
        });
      })
      .catch(function () {
        openPanel('Notifications', '<p style="color:#a32d2d;font-size:12px;">Could not load notifications.</p>');
      });
  }

  function openSettings() {
    openPanel('App settings', '<p style="font-size:12px;color:#7a85a0;">Loading…</p>');
    var local = readLocalSettings();
    var localDark = isLocalDark();

    function renderSettingsForm(s) {
      var darkOn = typeof s.dark_mode === 'boolean' ? s.dark_mode : localDark;
      openPanel(
        'App settings',
        '<form id="as-form" style="display:grid;gap:10px;">' +
          '<label style="font-size:11px;color:#7a85a0;">Language<select name="language" id="as-language" style="display:block;width:100%;margin-top:4px;padding:10px 12px;border:1px solid #dde3f0;border-radius:10px;font:inherit;">' +
          '<option value="en"' +
          (s.language === 'en' ? ' selected' : '') +
          '>English</option>' +
          '<option value="lg"' +
          (s.language === 'lg' ? ' selected' : '') +
          '>Luganda</option>' +
          '<option value="sw"' +
          (s.language === 'sw' ? ' selected' : '') +
          '>Swahili</option></select></label>' +
          toggleRowHtml('dark_mode', 'as-dark', 'Dark mode', darkOn) +
          toggleRowHtml('notify_deposits', 'as-deposits', 'Deposit confirmations', s.notify_deposits !== false) +
          toggleRowHtml('notify_ranks', 'as-ranks', 'Rank changes', s.notify_ranks !== false) +
          toggleRowHtml('notify_reminders', 'as-reminders', 'Saving reminders', s.notify_reminders !== false) +
          '<p id="as-msg" style="font-size:11px;color:#7a85a0;min-height:16px;">Toggles save automatically</p></form>'
      );

      var form = document.getElementById('as-form');
      if (!form) return;

      function collectSettings() {
        return {
          language: (document.getElementById('as-language') && document.getElementById('as-language').value) || 'en',
          notify_deposits: !!(document.getElementById('as-deposits') && document.getElementById('as-deposits').checked),
          notify_ranks: !!(document.getElementById('as-ranks') && document.getElementById('as-ranks').checked),
          notify_reminders: !!(document.getElementById('as-reminders') && document.getElementById('as-reminders').checked),
          dark_mode: !!(document.getElementById('as-dark') && document.getElementById('as-dark').checked),
        };
      }

      function persistSettings(next) {
        var msg = document.getElementById('as-msg');
        applyDark(!!next.dark_mode);
        writeLocalSettings(next);
        if (msg) {
          msg.textContent = 'Saving…';
          msg.style.color = '#7a85a0';
        }
        fetch('/api/profile/settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        })
          .then(function (r) {
            return r.json().then(function (b) {
              return { ok: r.ok, status: r.status, body: b };
            });
          })
          .then(function (res) {
            if (!res.ok) throw new Error(res.body.error || 'Save failed');
            if (res.body && res.body.settings) writeLocalSettings(res.body.settings);
            if (msg) {
              msg.textContent = 'Saved';
              msg.style.color = '#1a6e35';
            }
          })
          .catch(function () {
            if (msg) {
              msg.textContent = 'Saved on this device';
              msg.style.color = '#1a6e35';
            }
          });
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        persistSettings(collectSettings());
      });

      var darkInput = document.getElementById('as-dark');
      if (darkInput) {
        darkInput.addEventListener('change', function () {
          persistSettings(collectSettings());
        });
      }
      ['as-deposits', 'as-ranks', 'as-reminders'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.addEventListener('change', function () {
            persistSettings(collectSettings());
          });
        }
      });
      var lang = document.getElementById('as-language');
      if (lang) {
        lang.addEventListener('change', function () {
          persistSettings(collectSettings());
        });
      }
    }

    fetch('/api/profile/settings', { credentials: 'include' })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, body: d };
        });
      })
      .then(function (res) {
        var serverSettings = (res.ok && res.body && res.body.settings) || {};
        var s = Object.assign(
          {
            language: 'en',
            notify_deposits: true,
            notify_ranks: true,
            notify_reminders: true,
            dark_mode: localDark,
          },
          local,
          serverSettings
        );
        // Match the theme currently applied on this device
        s.dark_mode = localDark;
        renderSettingsForm(s);
      })
      .catch(function () {
        renderSettingsForm(
          Object.assign(
            {
              language: 'en',
              notify_deposits: true,
              notify_ranks: true,
              notify_reminders: true,
              dark_mode: localDark,
            },
            local
          )
        );
      });
  }

  function openActivityFolder() {
    var screen = document.getElementById('profile-activity-screen');
    if (!screen) return;
    screen.hidden = false;
    screen.removeAttribute('hidden');
    screen.style.removeProperty('display');
    var back = document.getElementById('profile-activity-close');
    if (back) back.focus();
  }

  function closeActivityFolder() {
    var screen = document.getElementById('profile-activity-screen');
    if (!screen) return;
    screen.hidden = true;
    screen.setAttribute('hidden', '');
    screen.style.setProperty('display', 'none', 'important');
  }

  function wireActivityFolder() {
    var openBtn = document.getElementById('profile-activity-open');
    var closeBtn = document.getElementById('profile-activity-close');
    if (openBtn && !openBtn.dataset.activityWired) {
      openBtn.dataset.activityWired = '1';
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openActivityFolder();
      });
      openBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openActivityFolder();
        }
      });
    }
    if (closeBtn && !closeBtn.dataset.activityWired) {
      closeBtn.dataset.activityWired = '1';
      closeBtn.addEventListener('click', closeActivityFolder);
    }
  }

  function wireMenus() {
    var handlers = {
      personal: openPersonalDetails,
      payments: openPaymentMethods,
      history: openHistory,
      notifications: openNotifications,
      settings: openSettings,
      activity: openActivityFolder,
      folder: openFolder,
    };
    var rows = document.querySelectorAll('.menu-row[data-menu], .pf-row[data-menu], [data-menu]');
    rows.forEach(function (row) {
      var key = row.getAttribute('data-menu');
      if (key === 'folder' || key === 'activity') return;
      var handler = handlers[key];
      if (!handler || row.dataset.wired) return;
      row.dataset.wired = '1';
      row.setAttribute('role', 'button');
      if (!row.hasAttribute('tabindex')) row.tabIndex = 0;
      row.addEventListener('click', function (e) {
        if (e.target.closest('.av-edit, #profile-avatar-input, #profile-avatar-btn')) return;
        handler();
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handler();
        }
      });
    });
    wireFolder();
    wireActivityFolder();

    var personalClose = document.getElementById('profile-personal-close');
    if (personalClose && !personalClose.dataset.personalWired) {
      personalClose.dataset.personalWired = '1';
      personalClose.addEventListener('click', closePersonalFolder);
    }

    var gear = document.querySelector('.tb-settings');
    if (gear && !gear.dataset.wired) {
      gear.dataset.wired = '1';
      gear.addEventListener('click', openSettings);
    }

    var signout = document.querySelector('.signout');
    if (signout && !signout.dataset.wired) {
      signout.dataset.wired = '1';
      signout.style.cursor = 'pointer';
      signout.addEventListener('click', function () {
        try {
          localStorage.removeItem('kibbi_home_cache_v1');
          localStorage.removeItem('kibbi_home_cache_v2');
          sessionStorage.removeItem('kibbi_auth_v1');
          sessionStorage.removeItem('kb_profile_return');
        } catch (e) {}
        document.body.classList.remove('is-authenticated');
        document.documentElement.classList.remove('kb-authed');
        document.documentElement.classList.add('kb-auth-known');
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          .catch(function () {})
          .finally(function () {
            // Always land on analytics home after logout (Join/Login only when tapped)
            var home = 'kibbisave_home_final.html';
            if (isEmbed()) {
              try {
                window.parent.postMessage({ type: 'kb-profile-navigate', href: home }, '*');
              } catch (err) {
                window.location.href = home;
              }
              return;
            }
            window.location.href = home;
          });
      });
    }
  }

  function showProfile(data) {
    currentProfile = data;
    var user = data.user;
    var stats = data.stats;

    currentProfileName = user.name;
    wireAvatarUpload(function () {
      return currentProfileName;
    });
    wireMenus();
    wireFolder();
    wireActivityFolder();
    wireCreatedTabs();

    renderAvatar(user.picture, user.name);
    setText('profile-name', user.name);
    setText(
      'profile-handle',
      user.handle + ' · ' + (user.location || 'Uganda')
    );
    setText('profile-member', user.memberSince);
    setText('profile-menu-email', user.email || 'Signed in with Google');

    setText('profile-stat-groups', String(stats.groups));
    setText('profile-stat-lifetime', stats.totalSavedLabel || 'UGX 0');

    renderActivity(data.activity);

    var signout = document.querySelector('.signout');
    hideSkeleton();
    revealProfileApp();
    if (signout) signout.hidden = false;

    document.title = user.name + ' — KibbiSave Profile';
  }

  function profileFromAuth(authUser) {
    return {
      user: {
        id: authUser.userId,
        email: authUser.email || '',
        name: authUser.name || 'KibbiSave member',
        picture: authUser.picture || null,
        phone: null,
        handle: '@' + String(authUser.email || 'member').split('@')[0],
        location: 'Uganda',
        memberSince: 'Member',
      },
      stats: {
        groups: 0,
        totalSavedLabel: 'UGX 0',
        totalSavedSub: 'Join a group to start saving',
      },
      activity: [],
    };
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
        document.body.classList.add('is-authenticated');
        return fetch('/api/profile', { credentials: 'include' }).then(function (r) {
          return r.json().then(function (body) {
            return { status: r.status, body: body, auth: auth };
          });
        });
      })
      .then(function (result) {
        if (!result) return;
        if (result.status === 401) {
          showGuest();
          return;
        }
        if (result.body && result.body.user) {
          showProfile(result.body);
          return;
        }
        // Authenticated but profile API failed — still show signed-in UI
        showProfile(profileFromAuth(result.auth.user || {}));
        if (result.body && result.body.error) {
          setAvatarHint(result.body.error, 'error');
        }
      })
      .catch(function () {
        // Network failure after auth unknown — try not to falsely show guest
        fetch('/api/auth/me', { credentials: 'include' })
          .then(function (r) {
            return r.json();
          })
          .then(function (auth) {
            if (auth.authenticated) {
              showProfile(profileFromAuth(auth.user || {}));
            } else {
              showGuest();
            }
          })
          .catch(function () {
            showError('Could not reach the server. Refresh to retry.');
          });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProfile);
  } else {
    loadProfile();
  }
})();
