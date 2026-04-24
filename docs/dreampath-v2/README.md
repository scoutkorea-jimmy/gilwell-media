# Dreampath v2 Design System — Reference

**Source**: User-supplied "PMO Style Tokens v2 (ERP)" + "Layout 시안 1차" screenshots.

**Target aesthetic**: ERP-dense, flat, institutional-grade. Navy/green brand,
cool grays (Tailwind-aligned), 2px radii default, 13px UI base, no shadows
except overlays. Motion philosophy 120ms. ⌘K command palette. Signature
thread (2px navy→green gradient) at top of every page.

**Living source**: `dreampath-v2.html` + `js/dreampath-v2.js` at repo root.
If a token conflict arises between this folder and those files, the files win
(they're what actually ships).

## Key decisions baked in

- **Density**: 32px default row, 28px compact, 40px comfort. Per-user toggle stored in localStorage.
- **Touch target**: 40px (mouse-first; reduced from the 44px WCAG recommendation because this is an internal admin surface).
- **Focus**: 2px navy-600 outline + 2px offset ring.
- **Type**: Inter (fallback system) for UI, JetBrains Mono for code/IDs.
- **Icons**: Stroke-only SVG at 14–16px, inherited via `currentColor`. Same CSS mask trick as before.
- **Data viz**: 8-color Okabe-Ito-adapted palette, CUFS-harmonized.
- **Signature thread**: Rendered as the first element of every page and in print headers.

## Navigation groups (sidebar)

Per the tokens doc's sidebar demo:

```
Workspace
  · Home
  · Announcements  (badge)
Project
  · Documents
  · Meeting Minutes  (badge)
  · Tasks  (badge)
  · Notes / Issues
Team
  · Team Boards
  · Calendar
  · Contacts
Settings
  · Dev Rules
  · Versions
```

## Home page surfaces

Per the layout screenshot:

**Top**: breadcrumb + density/contrast switch + search + ⌘K + user

**Page head**: "Good morning, {name}" + day·date·meetings count

**Stat strip** (5 chips, colored left border by tone):
- My tasks due (4) — "2 overdue · act now"
- Pending approvals (7) — "Budget · Minutes · Docs"
- Unread mentions (12) — "+5 since yesterday"
- Today's meetings (3) — "Next · 10:30 Stand-up"
- Sprint 14 progress (62%) — "+8 pts this week"

**Body grid 2/3 + 1/3**:

Left (main):
- Announcements panel (3 latest posts, card list with ack counts)
- Pending your approval (audit-row style with Review/Approve inline)
- Activity (last 24h, audit-row style)

Right (rail):
- Today schedule (time-slotted list: 10:30 Stand-up, 13:00 Sprint planning, ...)
- My tasks (dense table of 4-5 rows, TASK-408 Onboarding flow review, etc.)
- Team online (avatar row)
- Sprint 14 · 62% (progress bar + done/in-progress/todo counts)

## Why rebuild from scratch

Prior `dist/dreampath/` handoff had a different home implementation (no Announcements embed, Kanban tasks, different stat labels). The tokens doc + screenshot together define the latest target. We port IIFE structure, keyboard delegation, and case-study comments forward; the CSS and render functions get a full rewrite.

## Deployment

v2 lives at `/dreampath-v2` (staging) until Phase 4 cutover. CSP exception registered in `functions/_middleware.js isLegacyInlinePath()`.
