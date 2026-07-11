// ============================================================
// KIBBISAVE — LEADERBOARD (real Neon data via GET /api/leaderboard)
// Kept for pages that still load this script; the v5 HTML also
// inlines the same fetch. Never invents ranks or demo groups.
// ============================================================
(function () {
  var list = document.getElementById('lb-list');
  var err = document.getElementById('lb-error');
  if (!list) return;

  function showErr(m) {
    if (!err) return;
    err.textContent = m || '';
    err.style.display = m ? 'block' : 'none';
  }
  function fmtUGX(n) {
    return 'UGX ' + (Number(n) || 0).toLocaleString('en-US');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  fetch('/api/leaderboard', { credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) {
        showErr(d.error);
        list.innerHTML = '';
        return;
      }
      var groups = d.groups || [];
      if (!groups.length) {
        list.innerHTML =
          '<div class="empty"><img class="kb-illus" src="/assets/illustrations/svg/11-climbing-the-ranks.svg" alt="Character climbing steps with rising arrow" width="220" height="220" decoding="async"><div>No ranked groups yet.<br>A group joins the leaderboard once it closes — get a group to 10 members to be first!</div></div>';
        return;
      }
      list.innerHTML = groups.map(function (g) {
        var rank = g.leaderboard_rank;
        var prev = g.leaderboard_prev_rank;
        var move = (prev == null || prev === rank) ? ['same', '—']
                 : (prev > rank ? ['up', '▲'] : ['down', '▼']);
        var lead = Number(g.avg_member_lead) || 0;
        var pct = Math.max(0, Math.min(100, Number(g.target_pct) || 0));
        return '<div class="lb-row" data-href="kibbisave_my_group_detail_v2.html?id=' + esc(g.id) + '">' +
          '<div class="lb-rank r' + rank + '">' + rank + '</div>' +
          '<div class="lb-move ' + move[0] + '">' + move[1] + '</div>' +
          '<div class="lb-info">' +
            '<div class="lb-name">' + esc(g.name || g.code || 'Group') + '</div>' +
            '<div class="lb-meta">' + (g.current_members || 0) + '/' + (g.max_members || 10) + ' members · ' +
              g.period_months + ' months · goal ' + fmtUGX(g.target_amount) + '</div>' +
            '<div class="lb-prog-wrap"><div class="lb-prog" style="width:' + pct + '%"></div></div>' +
          '</div>' +
          '<div class="lb-right">' +
            '<div class="lb-saved">' + fmtUGX(g.total_saved) + '</div>' +
            '<span class="lb-lead ' + (lead >= 0 ? 'ahead' : 'behind') + '">' +
              (lead > 0 ? '+' : '') + lead.toFixed(2) + '%</span>' +
          '</div>' +
        '</div>';
      }).join('');
      list.querySelectorAll('.lb-row').forEach(function (row) {
        row.addEventListener('click', function () {
          window.location.href = row.getAttribute('data-href');
        });
      });
    })
    .catch(function () {
      showErr('Could not reach the server. Refresh to retry.');
      list.innerHTML = '';
    });
})();
