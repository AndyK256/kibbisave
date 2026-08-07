---
name: check-project-rules
description: >-
  Reads KibbiSave project rules in .cursor/rules before generating or editing
  any UI, HTML, CSS, or JS. Use at the start of every KibbiSave coding or design
  task, before writing buttons, cards, colors, glass surfaces, community/group
  screens, or any new feature UI. Always check brand color rules and the
  kibbisave-social-saving skill first.
---

# Check project rules before generating

## When to use

Use this skill **first**, before generating or editing anything in the KibbiSave app — especially UI, colors, buttons, cards, messages, communities, or groups.

Also read **first**: `.cursor/skills/kibbisave-social-saving/SKILL.md` (product aim & social UX).

## Required workflow

Copy and follow:

```
Rules check:
- [ ] Listed files in .cursor/rules/
- [ ] Read kibbisave-brand-color.mdc
- [ ] Read kibbisave-social-saving.mdc
- [ ] Read kibbisave-social-saving skill (.cursor/skills/kibbisave-social-saving/SKILL.md)
- [ ] Read check-rules-first.mdc (and any other .mdc files)
- [ ] Confirmed CTAs use --kb-msg-gradient (not flat #00008b)
- [ ] Confirmed blue text/amounts use --kb-primary
- [ ] Confirmed cards/sheets use glass tokens or kb-glass
- [ ] Confirmed chrome/nav uses --kb-navy when solid navy is required
- [ ] Confirmed social UX: total savings not followers; Message side action; history-aware back
- [ ] Will sync public/ mirrors if editing HTML/CSS/JS that exist in both places
```

### Step 1 — Load rules and skills

1. Glob or list `.cursor/rules/*.mdc`.
2. **Read** each rule file with the Read tool (do not rely on memory alone).
3. **Read** `.cursor/skills/kibbisave-social-saving/SKILL.md`.
4. Treat `kibbisave-brand-color.mdc` as the source of truth for color and glass.
5. Treat `kibbisave-social-saving` as the source of truth for product aim and social UX.

### Step 2 — Generate only after rules are loaded

Only after Step 1:

- Write or edit code that matches those rules.
- Prefer existing tokens/classes in `css/kibbisave-site.css` / `public/css/kibbisave-site.css`.
- Reject purple/indigo kits, flat primary CTAs, and opaque white interactive cards where glass is required.
- Prefer total savings heroes, Message side actions, and `history.back()` with parent fallbacks.

### Step 3 — Quick self-check before finishing

- [ ] No new hardcoded foreign blues (`#3b82f6`, `#4f46e5`, etc.)
- [ ] Primary actions use `var(--kb-msg-gradient)` / `kb-msg-btn`
- [ ] Ink amounts/labels use `var(--kb-primary)`
- [ ] Interactive cards/panels use glass tokens
- [ ] No Follow/Follower UI unless requested
- [ ] Root + `public/` stay in sync when both copies exist

## Rule locations

| Path | Purpose |
|------|---------|
| `.cursor/rules/kibbisave-brand-color.mdc` | Brand blue, gradient, glass, parity |
| `.cursor/rules/kibbisave-social-saving.mdc` | Social saving product UX (always on) |
| `.cursor/rules/check-rules-first.mdc` | Always read rules/skills before generating |
| `.cursor/skills/kibbisave-social-saving/SKILL.md` | Product aim & social UX skill |
| `.cursor/skills/check-project-rules/SKILL.md` | This skill |

## Do not

- Skip reading rules because the task seems small
- Invent a new palette “just for this screen”
- Put skills in `~/.cursor/skills-cursor/` (reserved for Cursor built-ins)
