# KibbiSave Illustration Set — Placement Guide (for the coding AI)

**Canonical set:** `_graphics_preview/images/` (39 illustrations). Deploy via `node scripts/copy-illustrations.js` → `public/assets/illustrations/` and `assets/illustrations/`.

Style: faceless doodle characters, white fill, brand-navy (`#00008b` / `--kb-primary`) outlines, light navy-tint (`#e8eaf8`) props, TRANSPARENT background.

- `png/` — 2048×2048 transparent PNGs (fallback)
- `svg/` — vector sources (prefer these on web)

General rules (be conservative):
- Display centered above the state's heading/CTA unless noted.
- Never stretch; keep square aspect ratio. Recommended render widths below.
- Transparent background works on both white pages and navy (`#00008b` / `--kb-navy`) banners.
- Add `alt` text as given.
- Do **not** use `#1B66DB` for strokes or chrome — that hex is obsolete; match `kibbisave-brand-color.mdc`.

| # | File | Screen (URL) | Exact placement | Width | Alt text |
|---|------|--------------|-----------------|-------|----------|
| 01 | 01-welcome-hello.png | /login?tab=join and first-run onboarding | Above the sign-up form title, centered | 220–280px | Character waving hello |
| 02 | 02-join-group-handshake.png | kibbisave_groups_v6.html | Header of "Open Groups" list; join-group confirmation modal | 200px | Two characters shaking hands |
| 03 | 03-team-high-five.png | Any screen — success modal/toast after joining a group or completing a savings cycle | Centered in modal above success message | 200–240px | Two characters high-fiving |
| 04 | 04-no-groups-empty.png | kibbisave_home_final.html | Inside "No active groups yet" empty-state card, above the CTA button | 180–220px | Character peeking into an empty jar |
| 05 | 05-goal-reached.png | kibbisave_home_final.html goal card at 100%; celebration modal | Centered above "Goal reached" text | 220px | Character celebrating with coins |
| 06 | 06-deposit-success.png | kibbisave_deposit_v2.html | Success screen after confirmed deposit, above amount summary | 220px | Character holding phone with checkmark |
| 07 | 07-make-first-deposit.png | kibbisave_deposit_v2.html intro/empty state; Home new-user banner | Above "Make your first deposit" copy | 200px | Character dropping a coin into a piggy bank |
| 08 | 08-invite-a-friend.png | Group detail invite section; Home referral banner | Left of invite copy, or centered in card | 180px | Character offering a gift |
| 09 | 09-community-together.png | kibbisave_community_explore.html | Page header hero; empty feed state | 240–300px | Three characters standing together |
| 10 | 10-leaderboard-champion.png | kibbisave_leaderboard_v5.html | Header above top-3 podium; "you reached #1" toast | 200px | Character holding a trophy |
| 11 | 11-climbing-the-ranks.png | kibbisave_leaderboard_v5.html | "Your rank" card when user is unranked; empty leaderboard | 220px | Character climbing steps with rising arrow |
| 12 | 12-complete-your-profile.png | kibbisave_profile_screen.html | Incomplete-profile prompt card, next to "Complete profile" CTA | 180px | Character holding a pencil beside an ID card |
| 13 | 13-savings-streak.png | kibbisave_home_final.html streak / weekly-summary card | Beside streak count | 200px | Character with a calendar of checkmarks |
| 14 | 14-payment-reminder.png | In-app notification / reminder modal for contribution due | Centered above due amount | 180px | Pleading character under a ringing bell |
| 15 | 15-something-went-wrong.png | Generic error states: failed deposit, failed load, 500 page | Above "Try again" button | 200px | Bowing apologetic character |
| 16 | 16-no-connection.png | Offline banner / full-screen offline state | Above "You are offline" copy | 200px | Shrugging character under a crossed-out cloud |
| 17 | 17-no-results-found.png | Groups & Community search empty results | Under the search bar, centered | 180–200px | Character with a magnifying glass |
| 18 | 18-no-notifications.png | Notifications panel empty state | Above "You're all caught up" | 180px | Character beside a sleeping bell |
| 19 | 19-safe-and-secure.png | Login/KYC screens; deposit trust footer | Beside "Your money is protected" copy | 160–200px | Character hugging a shield |
| 20 | 20-withdrawal-success.png | Withdraw flow confirmation screen | Centered above payout amount | 220px | Character with open hands catching coins |
| 21 | 21-friends-hangout.png | kibbisave_community_explore.html hero; social / "invite your circle" banners | Centered in hero or beside banner copy | 260–320px | Four friends sitting on the floor together |
| 22 | 22-grow-your-savings.png | Home growth/summary card; "grow your savings" onboarding | Beside growth copy | 200–240px | Character pouring coins along a forward arrow |
| 23 | 23-your-balance.png | Home balance / total-savings card; profile net-worth | Above or beside balance figure | 180–220px | Character standing proudly on a roll of cash |
| 24 | 24-stay-on-track.png | Reminder / at-risk state: behind on a savings target | Above "get back on track" copy | 200px | Character balancing on a tall wobbly coin stack |
| 25 | 25-low-balance.png | Deposit/withdraw: insufficient funds / low balance state | Above "top up" copy | 200px | Character with empty pockets |
| 26 | 26-build-your-savings.png | Groups/Home: building-savings explainer; progress card | Beside progress copy | 220–260px | Character scooping coins into rising stacks |
| 27 | 27-goal-smashed.png | Goal-complete celebration modal; big-milestone toast | Centered above "goal smashed" | 220–260px | Character celebrating in a pile of cash |
| 28 | 28-earn-rewards.png | Rewards / interest / referral-earnings screen | Beside rewards copy | 200–240px | Character fishing for coins with a dollar as bait |
| 29 | 29-your-group.png | kibbisave_groups_v6.html group detail header; "your savings group" overview | Header / hero of a group page | 240–300px | Team seated around a meeting table |
| 30 | 30-group-agreement.png | Group join-request approval; group rules/agreement screen | Above "agree" / approval copy | 220–260px | Two members reaching across the table to agree |
| 31 | 31-review-together.png | Group contributions / statements review; admin ledger | Beside review copy | 240–300px | Group reviewing papers together at a table |
| 32 | 32-plan-together.png | Create-group / set-goal flow; group planning | Above planning copy | 240–280px | A presenter and seated group planning |
| 33 | 33-community-meetup.png | kibbisave_community_explore.html; events / meetup cards | Hero or beside meetup copy | 240–300px | Relaxed community meetup around a table with coffee |
| 34 | 34-sit-back-relax.png | Auto-save enabled confirmation; "you're all set" states | Above reassurance copy | 200–240px | Character relaxing and reading in an armchair |
| 35 | 35-feet-up.png | Passive/idle dashboard; "nothing to do" states | Beside copy | 220–260px | Character with feet up on a sofa |
| 36 | 36-grow-while-you-sleep.png | Interest/growth explainer; "your savings grow while you sleep" | Above copy | 220–260px | Character sleeping in bed with Zzz |
| 37 | 37-auto-save.png | Auto-save / recurring-deposit setup & confirmation | Beside auto-save copy | 200–240px | Character relaxing with a remote, savings on the screen |
| 38 | 38-save-for-holiday.png | Goal type: holiday/vacation; goal-picker illustration | In goal card | 220–260px | Character on a sun lounger |
| 39 | 39-set-and-forget.png | "Set it and forget it" onboarding; recurring-savings success | Above copy | 200–240px | Character with feet up checking savings on a phone |

Brand palette used: primary navy `#00008b` (`--kb-primary` / `--kb-navy`), light fill `#e8eaf8`, white `#FFFFFF`.
