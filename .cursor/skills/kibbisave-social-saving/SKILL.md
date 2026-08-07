---
name: kibbisave-social-saving
description: >-
  KibbiSave product aim and social-saving UX: group savings, communities,
  profiles with total savings (not followers), side Message actions, and
  Instagram/Facebook-style back navigation plus caching. Use at the start of
  every KibbiSave feature, UI, profile, group, community, messages, or
  navigation task — read this skill first together with check-project-rules.
---

# KibbiSave — social saving product skill

## When to use

Use this skill **first** (with `check-project-rules`) before generating or editing KibbiSave features, screens, profiles, groups, communities, messages, or navigation.

## Product aim

KibbiSave is a **social saving** application:

- People **join** or **create** saving **groups** and save together toward goals.
- People join **communities** that share something in common with them (public, private, organisation, donating).
- Social identity is built around **savings progress and trust**, not vanity metrics.
- UX should feel familiar like **Instagram** and **Facebook** for profiles, messaging entry points, and back navigation — adapted to money/savings language.

## Core social model (not a clone of follower graphs)

| Typical social app | KibbiSave |
|--------------------|-----------|
| Followers / following counts | **Total savings** (and related goal / lead signals) as the hero social number |
| Follow button | Join group / Join community / Deposit CTAs (`kb-msg-btn` / `--kb-msg-gradient`) |
| Profile actions | **Message** as a primary side action next to view/join patterns |
| Feed of posts | Standings, group/community cards, progress, and messages tabs |

When designing profile or member overlays:

- Prefer **total savings** as the large hero figure (not follower counts).
- Keep a **Message** control on the side (or primary action row), consistent with existing member-profile overlays.
- Do not invent Follow/Follower UI unless the user explicitly asks.

## Groups & communities

- **Groups**: time-bound saving circles (open or private); member standings + messages.
- **Communities**: broader circles by kind/affinity; member standings + messages for members.
- Guests see gates for member-only chat; standings may be public where product already allows it.
- Keep **group ↔ community parity** for tabs (Member standings + Messages) and brand chrome.

## Instagram / Facebook UX patterns to follow

1. **Back always returns to the previous page**
   - Prefer `history.back()` when history exists; otherwise fall back to the logical parent list (Groups / Communities / Home).
   - Sticky back/share chrome on detail sheets should not break stack navigation.
   - Do not hard-wire every back button only to Home unless that was the entry point.

2. **Cache where necessary**
   - Cache stable reads that make revisits feel instant (lists, last-opened group/community summary, auth-known flags already in `sessionStorage`).
   - Invalidate or refetch after join/deposit/create/message send.
   - Prefer existing app patterns (`sessionStorage` auth hints, URL `?tab=` deep links) over inventing a new cache layer unless needed.
   - Do not cache secrets or raw payment credentials in the client.

3. **Familiar interaction chrome**
   - Profile-like overlays: hero total → identity → Message / secondary actions → sections.
   - Horizontal swipe between primary tabs (standings ↔ messages) where already used on Groups.
   - Soft empty states on white/glass backgrounds; primary CTAs use brand message gradient.

## Build checklist (social + product)

```
Social-saving check:
- [ ] Read this skill (kibbisave-social-saving)
- [ ] Read check-project-rules / .cursor/rules (brand + glass)
- [ ] Feature fits groups and/or communities social-saving model
- [ ] Profile/member surfaces emphasize total savings, not followers
- [ ] Message action present where peer-to-peer chat is intended
- [ ] Back uses previous-page history with sensible fallback
- [ ] Cache/reuse considered for list/detail revisits; invalidate on mutations
- [ ] Root + public/ mirrors synced when both copies exist
```

## Skills required to build this kind of app (agent guidance)

When implementing features, think in these layers:

1. **Product / UX** — social saving loops (create/join group, join community, deposit, standings race, messages).
2. **Frontend** — HTML/CSS/JS pages, glass + brand tokens, sticky chrome, swipe panels, overlays.
3. **Auth & session** — login/join gates; members-only messages; safe public views.
4. **API / data** — groups, communities, standings, messages, join codes; keep client and API contracts aligned.
5. **Trust & money UX** — clear amounts (`var(--kb-primary)`), goals, progress; never confuse social proof with bank balance privacy.
6. **Navigation & performance** — history-aware back; light client cache; sync `public/` for deploys.

## Do not

- Treat KibbiSave as a generic Instagram clone (posts/reels/followers-first).
- Add follower counts or Follow buttons by default.
- Break brand rules (`kibbisave-brand-color.mdc`) while making it more social.
- Skip this skill on small profile, message, group, or community tweaks.
- Put skills in `~/.cursor/skills-cursor/` (reserved for Cursor built-ins)

## Related

| Path | Purpose |
|------|---------|
| `.cursor/skills/check-project-rules/SKILL.md` | Brand/rules checklist — also read first |
| `.cursor/rules/kibbisave-brand-color.mdc` | Brand blue, gradient, glass |
| `.cursor/rules/check-rules-first.mdc` | Always read rules/skills before generating |
| `.cursor/rules/kibbisave-social-saving.mdc` | Always-on product UX rule mirror |
