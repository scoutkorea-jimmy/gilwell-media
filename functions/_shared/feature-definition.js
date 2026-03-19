export const DEFAULT_FEATURE_DEFINITION = `# Feature Definition

This document is the working feature definition for BPmedia. Any UI or workflow change should be checked against this file before implementation and again before deploy.

## Calendar

- Public calendar has two views: \`월간 일정보기\` and \`연간 일정보기\`.
- Monthly view is the primary interaction model.
- Multi-day events should render as a continuous bar across the week row, closer to Google Calendar than per-day isolated chips.
- Clicking an event in the left calendar opens the event detail modal.
- Event detail modal must show:
  - title
  - original title when present
  - event time/range
  - location name
  - manually managed address
  - tags
  - related article links
  - external link when present
- Event detail modal must always include \`일정 수정\` and \`일정 삭제\` actions.
- Those actions must always require a fresh admin password check, even if the user is already logged in.
- Editing from the public calendar should happen in modal flow, not by redirecting to admin.

## Calendar Side Panel

- Right-side event cards should not show description by default.
- Each card should include \`자세히 보기\` as an inline expansion control.
- \`관련 기사 읽기\` and \`외부 링크\` should share the same visual style.
- The side panel title should reflect the currently viewed month.
- Status grouping rules:
  - \`진행중\`: events intersecting the selected month
  - \`개최예정\`: events starting within the selected month and following 2 months
  - \`행사종료\`: events ended within the selected month and previous 2 months
- Category color should follow region (\`KOR/APR/EUR/AFR/ARB/IAR/WOSM\`) rather than status color.

## Calendar Map

- Calendar map should only show \`진행중\` and \`개최예정\` events.
- Finished events should not appear on the map.
- When event titles are shown in map popups, clicking the title should open the same calendar detail modal.

## Location Handling

- Location search may use OSM/Nominatim, but public display should prefer curated fields.
- The address shown in lists and detail views should be the manually managed address field, not raw OSM display text.
- Search results may seed location name and address, but saved values should remain editable.

## Admin Calendar Management

- Admin calendar needs:
  - event create/edit/delete
  - shared calendar tag management
  - title batch edit for rapid cleanup of overlapping or duplicated titles
- Batch title editing should let admins edit Korean title and original title for all events in one place.

## Development Rule

- Before development: check this file.
- Before preview or production deploy: confirm the implemented behavior still matches this file.
`;

export async function loadFeatureDefinition(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'feature_definition'`).first();
  return row && row.value ? String(row.value) : DEFAULT_FEATURE_DEFINITION;
}
