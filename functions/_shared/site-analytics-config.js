export function configuredAnalyticsId(env) {
  const id = env?.GA4_MEASUREMENT_ID;
  return typeof id === 'string' && /^G-[A-Z0-9]{6,20}$/.test(id) ? id : '';
}
