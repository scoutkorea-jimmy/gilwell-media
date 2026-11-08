import { queryRust } from '../../_shared/rust-server.js';
import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { gateMenuAccess } from '../../_shared/admin-permissions.js';
import { fetchReleaseDeployments, fetchReleaseSnapshots } from '../../_shared/release-history.js';
import { ensureOperationalEventsTable } from '../../_shared/ops-log.js';

// 주의: /api/admin/operations(배포·릴리스 이력)는 대시보드 첫 화면에서도 호출하므로
// OTP 게이트를 걸지 않는다. 사이트 히스토리 메뉴 보호는 프론트 진입 게이트 +
// /api/admin/site-history(민감 운영 이벤트) 에서 담당. (대시보드 OTP 오탐 방지)
export async function onRequestGet({ request, env }) {
  const __gate = await gateMenuAccess(request, env, 'site-history', 'view'); if (__gate) return __gate

  try {
    await ensureOperationalEventsTable(env);
    const query = kind => queryRust({request, env}, 'admin-operations', {kind})
      .then(response => { if (!response.ok) throw new Error('Rust operations query failed'); return response.json(); });

    const coreQuery = queryRust({request, env}, 'admin-operations-core', {}).then(async response => {
      if (!response.ok) throw new Error('Rust operations core query failed');
      const data = await response.json();
      if (!['scheduled','drafts','errors','logins'].every(key => Array.isArray(data[key]))) throw new Error('Invalid operations core response');
      return data;
    });
    const [core, settingsRows, deployments, snapshots, schedulerHeartbeatRow] = await Promise.all([
      coreQuery,
      query('settings').then(data => ({results:data.rows})).catch(() => ({results:[]})),
      fetchReleaseDeployments().catch(function () { return []; }),
      fetchReleaseSnapshots().catch(function () { return []; }),
      query('heartbeat').then(data => data.row).catch(() => null),
    ]);

    return json(await assembleOperationsRust({scheduled:core.scheduled,drafts:core.drafts,errors:core.errors,logins:core.logins,settings:settingsRows.results || [],deployments,snapshots,heartbeat:schedulerHeartbeatRow}, env));
  } catch (err) {
    console.error('GET /api/admin/operations error:', err);
    return json({ error: 'Database error' }, 500);
  }
}

export function assembleOperationsLegacy(input) {
  const deploymentItems = normalizeDeployments(input.deployments, input.snapshots);
  const deployAlerts = deploymentItems.filter(function (item) {
      return item.status && item.status !== 'success';
    }).slice(0, 6);

  return {
      scheduled_posts: (input.scheduled || []).map(function (item) {
        return {
          id: item.id,
          title: item.title || '',
          category: item.category || '',
          publish_at: item.publish_at || '',
        };
      }),
      draft_posts: (input.drafts || []).map(function (item) {
        return {
          id: item.id,
          title: item.title || '',
          category: item.category || '',
          updated_at: item.updated_at || '',
        };
      }),
      recent_errors: (input.errors || []).map(normalizeEvent),
      recent_logins: (input.logins || []).map(normalizeEvent),
      recent_settings: (input.settings || []).map(function (item) {
        return {
          key: item.key || '',
          saved_at: item.saved_at || '',
        };
      }),
      deployments: deploymentItems.slice(0, 8),
      deploy_alerts: deployAlerts,
      scheduler_last_run: (input.heartbeat && input.heartbeat.value) || null,
    };
}

export async function assembleOperationsRust(input, env = {}, run = queryRust) {
  const fallback = () => assembleOperationsLegacy(input);
  try {
    const scalar = value => value == null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
    const groups = {
      scheduled:['id','title','category','publish_at'], drafts:['id','title','category','updated_at'],
      errors:['id','channel','type','level','actor','path','message','created_at'],
      logins:['id','channel','type','level','actor','path','message','created_at'],
      settings:['key','saved_at'], deployments:['id','environment','branch','source','url','created_on','latest_stage','version','site_version','admin_version','commit_message'],
      snapshots:['id','version','site_version','admin_version'],
    };
    if (!input || !Object.entries(groups).every(([name,keys]) => Array.isArray(input[name]) && input[name].every(row =>
      row && typeof row === 'object' && !Array.isArray(row) && keys.every(key => scalar(row[key]))
    )) || (input.heartbeat != null && (typeof input.heartbeat !== 'object' || Array.isArray(input.heartbeat) || !scalar(input.heartbeat.value))) ||
      /\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(input))) return fallback();
    const response = await run({env,request:{url:'https://internal.invalid/'}}, 'operations-assemble', input);
    if (!response.ok) return fallback();
    const result = await response.json();
    if (!result || !['scheduled_posts','draft_posts','recent_errors','recent_logins','recent_settings','deployments','deploy_alerts'].every(key => Array.isArray(result[key])) ||
      result.scheduled_posts.length !== input.scheduled.length || result.draft_posts.length !== input.drafts.length ||
      result.recent_errors.length !== input.errors.length || result.recent_logins.length !== input.logins.length || result.recent_settings.length !== input.settings.length ||
      result.deployments.length !== Math.min(input.deployments.length,8) || result.deploy_alerts.length > 6 || !Object.hasOwn(result,'scheduler_last_run')) return fallback();
    return result;
  } catch { return fallback(); }
}

function normalizeEvent(item) {
  return {
    id: item.id || 0,
    channel: item.channel || '',
    type: item.type || '',
    level: item.level || 'info',
    actor: item.actor || '',
    path: item.path || '',
    message: item.message || '',
    created_at: item.created_at || '',
  };
}

function normalizeDeployments(deployments, snapshots) {
  const snapshotMap = new Map((Array.isArray(snapshots) ? snapshots : []).map(function (item) {
    return [String(item.id || ''), item];
  }));
  return (Array.isArray(deployments) ? deployments : []).map(function (item) {
    const snapshot = snapshotMap.get(String(item.id || '')) || null;
    return {
      id: item.id || '',
      environment: item.environment || '',
      branch: item.branch || '',
      source: item.source || '',
      url: item.url || '',
      created_on: item.created_on || '',
      status: item.latest_stage || '',
      version: item.version || (snapshot && snapshot.version) || '',
      site_version: item.site_version || (snapshot && snapshot.site_version) || '',
      admin_version: item.admin_version || (snapshot && snapshot.admin_version) || '',
      commit_message: item.commit_message || '',
    };
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
