export function buildUtmCampaigns(rows) {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const campaign = String(row && row.utm_campaign || '').trim();
    const source = String(row && row.utm_source || '').trim();
    const medium = String(row && row.utm_medium || '').trim();
    if (!campaign && !source && !medium) return;
    const key = [campaign || '(none)', source || '(none)', medium || '(none)'].join('|');
    const current = map.get(key) || {
      campaign: campaign || '(none)',
      source: source || '(none)',
      medium: medium || '(none)',
      visits: 0,
    };
    current.visits += 1;
    map.set(key, current);
  });
  return Array.from(map.values())
    .sort((a, b) => b.visits - a.visits || a.campaign.localeCompare(b.campaign, 'ko'))
    .slice(0, 12);
}
