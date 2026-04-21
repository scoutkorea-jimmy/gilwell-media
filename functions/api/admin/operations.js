import { extractToken, verifyTokenRole } from '../../_shared/auth.js';
import { fetchReleaseDeployments, fetchReleaseSnapshots } from '../../_shared/release-history.js';
import { ensureOperationalEventsTable } from '../../_shared/ops-log.js';

export async function onRequestGet({ request, env }) {
  const token = extractToken(request);
  if (!token || !(await verifyTokenRole(token, env, 'full'))) {
    return json({ error: '인증이 필요합니다. 다시 로그인해주세요.' }, 401);
  }

  try {
    await ensureOperationalEventsTable(env);

    const [
      scheduledRows,
      draftRows,
      errorRows,
      loginRows,
      settingsRows,
      deployments,
      snapshots,
      schedulerHeartbeatRow,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT id, title, category, publish_at
           FROM posts
          WHERE published = 1
            AND datetime(COALESCE(publish_at, created_at)) > datetime('now')
          ORDER BY datetime(COALESCE(publish_at, created_at)) ASC
          LIMIT 6`
      ).all(),
      env.DB.prepare(
        `SELECT id, title, category, updated_at
           FROM posts
          WHERE published = 0
          ORDER BY datetime(updated_at) DESC, id DESC
          LIMIT 6`
      ).all(),
      env.DB.prepare(
        `SELECT id, channel, type, level, actor, path, message, created_at
           FROM operational_events
          WHERE level = 'error'
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 8`
      ).all(),
      env.DB.prepare(
        `SELECT id, channel, type, actor, message, created_at
           FROM operational_events
          WHERE type IN ('admin_login_failed', 'dreampath_login_failed', 'admin_login_success', 'dreampath_login_success')
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 10`
      ).all(),
      env.DB.prepare(
        `SELECT key, saved_at
           FROM settings_history
          ORDER BY datetime(saved_at) DESC, id DESC
          LIMIT 10`
      ).all().catch(function () { return { results: [] }; }),
      fetchReleaseDeployments().catch(function () { return []; }),
      fetchReleaseSnapshots().catch(function () { return []; }),
      env.DB.prepare("SELECT value FROM settings WHERE key = 'scheduler_last_run'").first().catch(function () { return null; }),
    ]);

    const deploymentItems = normalizeDeployments(deployments, snapshots);
    const deployAlerts = deploymentItems.filter(function (item) {
      return item.status && item.status !== 'success';
    }).slice(0, 6);

    return json({
      scheduled_posts: (scheduledRows.results || []).map(function (item) {
        return {
          id: item.id,
          title: item.title || '',
          category: item.category || '',
          publish_at: item.publish_at || '',
        };
      }),
      draft_posts: (draftRows.results || []).map(function (item) {
        return {
          id: item.id,
          title: item.title || '',
          category: item.category || '',
          updated_at: item.updated_at || '',
        };
      }),
      recent_errors: (errorRows.results || []).map(normalizeEvent),
      recent_logins: (loginRows.results || []).map(normalizeEvent),
      recent_settings: (settingsRows.results || []).map(function (item) {
        return {
          key: item.key || '',
          saved_at: item.saved_at || '',
        };
      }),
      deployments: deploymentItems.slice(0, 8),
      deploy_alerts: deployAlerts,
      scheduler_last_run: (schedulerHeartbeatRow && schedulerHeartbeatRow.value) || null,
    });
  } catch (err) {
    console.error('GET /api/admin/operations error:', err);
    return json({ error: 'Database error' }, 500);
  }
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
