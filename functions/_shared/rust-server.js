// Pages remains the security boundary; only the existing gated handlers call Wasm.
export async function runGlossary(context, body, id) {
  const { default: server } = await import('../../server-rust/build/worker/shim.mjs');
  const url = new URL(context.request.url);
  if (id !== undefined) url.pathname = '/api/glossary/' + id;
  const headers = new Headers(context.request.headers);
  headers.delete('Content-Length');
  const request = new Request(url, {
    method: context.request.method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = {
    waitUntil: context.waitUntil ? context.waitUntil.bind(context) : () => {},
    passThroughOnException() {},
  };
  return new server(ctx, context.env).fetch(request);
}

// Only Pages handlers can invoke this internal route after checking permissions.
export async function queryRust(context, route, options) {
  const { default: server } = await import('../../server-rust/build/worker/shim.mjs');
  const request = new Request(new URL('/__internal/' + route, context.request.url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options),
  });
  const ctx = {
    waitUntil: context.waitUntil ? context.waitUntil.bind(context) : () => {},
    passThroughOnException() {},
  };
  return new server(ctx, context.env).fetch(request);
}

export async function singleSetting(env, key, operation = 'get', value) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'settings-single', {key, operation, value});
  if (!response.ok) throw new Error('Rust setting operation failed');
  return (await response.json()).row;
}

export async function compareAndSetSetting(env, key, value, expected) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'settings-single', {key, operation:'cas', value, expected});
  if (!response.ok) throw new Error('Rust setting update failed');
  return (await response.json()).changes;
}

export async function settingSnapshot(env, target) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'settings-snapshot', {target});
  if (!response.ok) throw new Error('Rust setting snapshot failed');
  return response.json();
}
export async function saveRevisionedSetting(env, target, currentRev, nextRev, values) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'settings-save', {target, currentRev, nextRev:String(nextRev), values});
  if (!response.ok) throw new Error('Rust revisioned setting save failed');
  return (await response.json()).changes;
}

export async function privacySnapshot(env) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'privacy-snapshot', {});
  if (!response.ok) throw new Error('Rust privacy snapshot failed');
  return response.json();
}

export async function postAdminRead(env, kind, id = null) {
  const response = await queryRust({env, request:{url:'https://internal.invalid/'}}, 'post-admin-read', {kind,id});
  if (!response.ok) throw new Error('Rust post administration query failed');
  return (await response.json()).row;
}
