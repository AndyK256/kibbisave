// ============================================================
// KIBBISAVE — HOME PAGE API
// GET  /api/home            home summary (works logged in or out)
// GET  /api/auth/me         who am I (for the header button)
// POST /api/auth/logout     clear session
// POST /api/groups/:id/join join an open group (login required)
// POST /api/deposits        record + confirm a deposit (dev mode)
// ============================================================
const express = require('express');
const {
  authenticateUser, optionalAuth, supabase, clearSessionCookie
} = require('./session');

const router = express.Router();

// ------------------------------------------------------------
// GET /api/auth/me — used by kibbisave-site.js header
// ------------------------------------------------------------
router.get('/auth/me', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ authenticated: false });
  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      name: req.user.display_name || req.user.phone,
      phone: req.user.phone,          // phone number IS the account number
      account_number: req.user.phone.replace('+256', '0'),
      avatar_url: req.user.avatar_url
    }
  });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

// ------------------------------------------------------------
// GET /api/home
// Logged out: hero shows 0.00% + the 5 open groups
// Logged in with active groups: totals + "My groups"
// ------------------------------------------------------------
router.get('/home', optionalAuth, async (req, res) => {
  try {
    // keep open groups fresh (close 7-day/full groups, regenerate stale)
    await supabase.rpc('close_due_groups');

    // the 5 open system groups
    const { data: openGroups, error: ogErr } = await supabase
      .from('groups')
      .select('id, name, period_months, tier, current_members, max_members, target_amount, total_saved, target_pct, starts_at, closes_at, first_member_at, avg_member_lead')
      .eq('is_system', true).eq('status', 'open')
      .order('current_members', { ascending: false })
      .order('period_months', { ascending: true });
    if (ogErr) throw ogErr;

    const payload = {
      authenticated: !!req.user,
      summary: {                       // defaults per spec: 0.00% on open
        total_savings: 0,
        active_groups: 0,
        total_goal: 0,
        pct_reached: 0,
        avg_lead: 0,
        next_end_date: null,
        account_number: null
      },
      my_groups: [],
      open_groups: openGroups || []
    };

    if (req.user) {
      payload.summary.account_number = req.user.phone.replace('+256', '0');

      const { data: sum } = await supabase
        .from('user_home_summary').select('*')
        .eq('user_id', req.user.id).single();
      if (sum) {
        payload.summary.total_savings = Number(sum.total_savings) || 0;
        payload.summary.active_groups = Number(sum.active_groups) || 0;
        payload.summary.total_goal    = Number(sum.total_goal) || 0;
        payload.summary.pct_reached   = Number(sum.pct_reached) || 0;
        payload.summary.avg_lead      = Number(sum.avg_lead) || 0;
        payload.summary.next_end_date = sum.next_end_date;
      }

      const { data: myGroups } = await supabase
        .from('user_group_standings').select('*')
        .eq('user_id', req.user.id);
      payload.my_groups = myGroups || [];
    }

    res.json(payload);
  } catch (err) {
    console.error('GET /api/home error:', err);
    res.status(500).json({ error: 'Failed to load home data' });
  }
});

// ------------------------------------------------------------
// POST /api/groups/:id/join
// Body: { goal_amount, saving_for, suggest_name }
// ------------------------------------------------------------
router.post('/groups/:id/join', authenticateUser, async (req, res) => {
  try {
    const { goal_amount, saving_for, suggest_name } = req.body;
    const { data, error } = await supabase.rpc('join_open_group', {
      p_user_id: req.user.id,
      p_group_id: req.params.id,
      p_goal_amount: Math.round(Number(goal_amount) || 0),
      p_saving_for: saving_for || null,
      p_suggest_name: suggest_name || null
    });
    if (error) {
      // surface friendly DB errors ("Group is full" etc.)
      return res.status(400).json({ error: error.message.replace(/^.*?: /, '') });
    }
    res.json({ success: true, member_id: data });
  } catch (err) {
    console.error('join error:', err);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// ------------------------------------------------------------
// POST /api/deposits
// Body: { group_id, amount, provider, phone }
// Dev mode: records AND confirms immediately so all numbers update
// at once (home totals, leads, ranks). Production: move confirm
// into the Flutterwave webhook.
// ------------------------------------------------------------
router.post('/deposits', authenticateUser, async (req, res) => {
  try {
    const { group_id, amount, provider, phone } = req.body;
    const amt = Math.round(Number(amount) || 0);
    if (!group_id || amt <= 0) {
      return res.status(400).json({ error: 'group_id and a positive amount are required' });
    }

    const { data: pairId, error: recErr } = await supabase.rpc('record_deposit', {
      p_user_id: req.user.id,
      p_group_id: group_id,
      p_amount: amt,
      p_provider: provider || 'mtn_momo',
      p_provider_ref: 'DEV-' + Date.now(),
      p_phone: phone || req.user.phone
    });
    if (recErr) return res.status(400).json({ error: recErr.message.replace(/^.*?: /, '') });

    const { error: confErr } = await supabase.rpc('confirm_deposit', { p_pair_id: pairId });
    if (confErr) return res.status(400).json({ error: confErr.message.replace(/^.*?: /, '') });

    // notification per spec: "deposit successful, now you have such amounts"
    const { data: member } = await supabase
      .from('group_members')
      .select('total_deposited, avg_lead, groups(name)')
      .eq('user_id', req.user.id).eq('group_id', group_id)
      .eq('status', 'active').single();

    if (member) {
      await supabase.from('notifications').insert({
        user_id: req.user.id,
        type: 'deposit_confirmed',
        title: 'Deposit successful',
        body: `You now have UGX ${Number(member.total_deposited).toLocaleString()} in ${member.groups?.name || 'your group'}. Average lead: ${member.avg_lead > 0 ? '+' : ''}${member.avg_lead}%`,
        data: { group_id }
      });
    }

    res.json({ success: true, pair_id: pairId, member });
  } catch (err) {
    console.error('deposit error:', err);
    res.status(500).json({ error: 'Deposit failed' });
  }
});

module.exports = { router };
