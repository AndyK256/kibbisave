# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"c:\Users\ANDREW\Desktop\My kibbi app")

# --- 1) Sort open groups in kibbisave-groups.js (root + public) ---
GROUPS_OLD = """      var openBox = document.getElementById('open-groups');
      var open = d.open_groups || [];
"""
GROUPS_NEW = """      var openBox = document.getElementById('open-groups');
      var open = (d.open_groups || []).slice().sort(function (a, b) {
        return (Number(b.current_members) || 0) - (Number(a.current_members) || 0);
      });
"""

HOME_OLD = """      if (title) title.textContent = 'Open Groups';
      var open = data.open_groups || [];
"""
HOME_NEW = """      if (title) title.textContent = 'Open Groups';
      var open = (data.open_groups || []).slice().sort(function (a, b) {
        return (Number(b.current_members) || 0) - (Number(a.current_members) || 0);
      });
"""

BOTTOM_NAV_JS = r"""
  // ── Mobile bottom navigation (phones only; CSS hides on desktop) ──
  (function initMobileBottomNav() {
    var path = (window.location.pathname || '').split('/').pop() || '';
    if (/^login(\.html)?$/i.test(path) || /^signup(\.html)?$/i.test(path)) return;
    if (!document.querySelector('.site-header')) return;
    if (document.getElementById('kb-bottom-nav')) return;

    var tabs = [
      { id: 'menu', label: 'Menu', kind: 'menu' },
      { id: 'groups', label: 'Groups', href: 'kibbisave_groups_v6.html', match: /kibbisave_groups|kibbisave_join_group|kibbisave_create_group|kibbisave_my_group/i },
      { id: 'analytics', label: 'Analytics', href: 'kibbisave_home_final.html', match: /kibbisave_home|^(index\.html)?$/i },
      { id: 'communities', label: 'Communities', href: 'kibbisave_community_explore.html', match: /kibbisave_community|kibbisave_cause/i },
      { id: 'profile', label: 'Profile', href: 'kibbisave_profile_screen.html', match: /kibbisave_profile|kibbisave_deposit|kibbisave_leaderboard/i }
    ];

    function iconSvg(id) {
      if (id === 'menu') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      }
      if (id === 'groups') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0-2.83-4M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 2c2.67 0 8 1.34 8 4v2H13.5M8 13c-2.67 0-8 1.34-8 4v2h11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      if (id === 'analytics') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m5 10V5m5 14v-7m5 7V8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      }
      if (id === 'communities') {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.35-7-10a7 7 0 1 1 14 0c0 5.65-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="11" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
      }
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4.5V21h16v-2.5C20 16 16 14 12 14z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    var nav = document.createElement('nav');
    nav.id = 'kb-bottom-nav';
    nav.className = 'kb-bottom-nav';
    nav.setAttribute('aria-label', 'Primary');

    var html = '';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var active = t.match ? t.match.test(path) : false;
      // Prefer Analytics (home) when path is empty / root
      if (t.id === 'analytics' && (!path || path === '/' || path === 'index.html')) active = true;
      if (t.kind === 'menu') {
        html += '<button type="button" class="kb-bnav-item" data-kb-bnav="menu" aria-label="Open menu">' +
          iconSvg('menu') + '<span>' + t.label + '</span></button>';
      } else {
        html += '<a class="kb-bnav-item' + (active ? ' is-active' : '') + '" href="' + t.href + '"' +
          (active ? ' aria-current="page"' : '') + '>' +
          iconSvg(t.id) + '<span>' + t.label + '</span></a>';
      }
    }
    nav.innerHTML = html;
    document.body.appendChild(nav);
    document.body.classList.add('has-kb-bottom-nav');

    var menuBtn = nav.querySelector('[data-kb-bnav="menu"]');
    if (menuBtn) {
      menuBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var toggle = document.querySelector('.site-menu-toggle');
        if (toggle) toggle.click();
        else {
          var siteNav = document.querySelector('.site-nav');
          if (siteNav) siteNav.classList.toggle('open');
        }
      });
    }
  })();
"""

BOTTOM_NAV_CSS = r"""
/* ── Mobile bottom navigation (phones only) ── */
.kb-bottom-nav {
  display: none;
}

@media (max-width: 768px) {
  .kb-bottom-nav {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 120;
    height: calc(56px + env(safe-area-inset-bottom, 0px));
    padding: 0 0 env(safe-area-inset-bottom, 0px);
    background: #ffffff;
    border-top: 1px solid var(--kb-border);
    box-shadow: 0 -4px 18px rgba(0, 0, 56, 0.08);
    align-items: stretch;
    justify-content: space-around;
  }

  body.has-kb-bottom-nav {
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  }

  body.has-kb-bottom-nav .site-main {
    padding-bottom: 1rem;
  }

  .kb-bnav-item {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    padding: 6px 2px 4px;
    border: 0;
    background: transparent;
    color: #6b7280;
    text-decoration: none;
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.15;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .kb-bnav-item svg {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .kb-bnav-item span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kb-bnav-item.is-active {
    color: var(--kb-primary);
  }

  .kb-bnav-item.is-active svg {
    color: var(--kb-primary);
  }

  .kb-bnav-item:active {
    background: var(--kb-primary-light);
  }
}

@media (min-width: 769px) {
  .kb-bottom-nav { display: none !important; }
}

/* Light desktop header density polish (top-nav remains; no bottom bar) */
@media (min-width: 769px) {
  :root {
    --kb-nav-h: 56px;
  }

  .site-header-inner {
    padding: 0 1.5rem;
  }

  .site-nav {
    gap: 0.15rem;
  }

  .site-nav a {
    font-size: 0.84rem;
    padding: 0.4rem 0.75rem;
  }

  .site-logo {
    font-size: 1.28rem;
  }
}
"""


def patch_file(path: Path, old: str, new: str, label: str) -> None:
    if not path.exists():
        print("skip missing", path)
        return
    text = path.read_text(encoding="utf-8")
    if new.strip()[:40] in text and old not in text:
        print("already patched", label, path)
        return
    if old not in text:
        print("OLD NOT FOUND", label, path)
        return
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print("patched", label, path)


def ensure_js_bottom_nav(path: Path) -> None:
    if not path.exists():
        print("skip missing", path)
        return
    text = path.read_text(encoding="utf-8")
    if "initMobileBottomNav" in text:
        print("bottom nav already in", path)
        return
    # Insert before final closing of IIFE
    marker = "  fetch('/api/auth/me'"
    if marker not in text:
        # append before last `})();`
        idx = text.rfind("})();")
        if idx < 0:
            print("cannot find insert point", path)
            return
        text = text[:idx] + BOTTOM_NAV_JS + "\n" + text[idx:]
    else:
        text = text.replace(marker, BOTTOM_NAV_JS + "\n" + marker, 1)
    path.write_text(text, encoding="utf-8")
    print("added bottom nav js", path)


def ensure_css_bottom_nav(path: Path) -> None:
    if not path.exists():
        print("skip missing", path)
        return
    text = path.read_text(encoding="utf-8")
    if ".kb-bottom-nav" in text:
        print("bottom nav css already in", path)
        return
    path.write_text(text.rstrip() + "\n" + BOTTOM_NAV_CSS + "\n", encoding="utf-8")
    print("added bottom nav css", path)


def sync_pair(rel: str) -> None:
    src = ROOT / rel
    dst = ROOT / "public" / rel
    if src.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        print("synced", rel, "-> public/")


def main() -> None:
    for rel in ("js/kibbisave-groups.js", "public/js/kibbisave-groups.js"):
        patch_file(ROOT / rel, GROUPS_OLD, GROUPS_NEW, "groups-sort")

    for rel in ("js/kibbisave-home-data.js", "public/js/kibbisave-home-data.js"):
        patch_file(ROOT / rel, HOME_OLD, HOME_NEW, "home-sort")

    for rel in ("js/kibbisave-site.js", "public/js/kibbisave-site.js"):
        ensure_js_bottom_nav(ROOT / rel)

    for rel in ("css/kibbisave-site.css", "public/css/kibbisave-site.css"):
        ensure_css_bottom_nav(ROOT / rel)

    # Keep public in sync with root for the files we own
    for rel in (
        "js/kibbisave-groups.js",
        "js/kibbisave-home-data.js",
        "js/kibbisave-site.js",
        "css/kibbisave-site.css",
    ):
        sync_pair(rel)

    print("done")


if __name__ == "__main__":
    main()
