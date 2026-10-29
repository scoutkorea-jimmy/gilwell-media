// Public version probe used by the client-side "new build" banner.
// The client polls this on focus/visibility-change and compares against the
// version it loaded; if it differs, the user is offered a refresh button.
import { SITE_VERSION, ADMIN_VERSION, ASSET_VERSION } from '../_shared/build-version.js';

export async function onRequestGet() {
  return new Response(JSON.stringify({
    site_version: SITE_VERSION,
    admin_version: ADMIN_VERSION,
    asset_version: ASSET_VERSION,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
    },
  });
}
