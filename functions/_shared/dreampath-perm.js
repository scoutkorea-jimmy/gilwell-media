/**
 * Dreampath · shared permission helpers
 *
 * Used by every /api/dreampath/* handler to gate access based on the caller's
 * role + permission preset. Admin role bypasses every check. Non-admin members
 * must have the required `view:<scope>` or `write:<scope>` string in the
 * permissions array that the middleware attached to `data.dpUser.permissions`.
 *
 * Fail-closed philosophy: if permissions can't be resolved, deny. Missing
 * preset = deny. Unknown scope on a member = deny.
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Does the user have this scope?
 *   hasPerm(dpUser, 'view:tasks')
 *   hasPerm(dpUser, 'write:documents')
 * Admin always true. Everyone else needs the scope in their permissions array.
 */
export function hasPerm(dpUser, scope) {
  if (!dpUser) return false;
  if (dpUser.role === 'admin') return true;
  const perms = Array.isArray(dpUser.permissions) ? dpUser.permissions : [];
  return perms.includes(scope);
}

/**
 * Gate helper for handlers. Returns a Response (401/403) on failure, or
 * null when the user may proceed. Usage:
 *   const denied = requirePerm(data, 'view:minutes');
 *   if (denied) return denied;
 */
export function requirePerm(data, scope) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  if (hasPerm(user, scope)) return null;
  return json({ error: 'You do not have permission (' + scope + ').' }, 403);
}

/**
 * Admin-only gate (for users/presets/departments/activity endpoints).
 */
export function requireAdmin(data) {
  const user = data && data.dpUser;
  if (!user) return json({ error: 'Authentication required.' }, 401);
  if (user.role === 'admin') return null;
  return json({ error: 'Admin access required.' }, 403);
}

/**
 * Given a board slug, return the permission scope that gates it. Non-standard
 * boards (team_*, custom boards from dp_boards) map to write/view:teams so
 * they inherit the Team Boards permission. Core boards get their own scope.
 */
export function boardScope(board, action) {
  const prefix = action === 'write' ? 'write:' : 'view:';
  const b = String(board || '').toLowerCase();
  if (b === 'announcements' || b === 'documents' || b === 'minutes') return prefix + b;
  // team_korea / team_japan / etc. + any user-created board → teams scope.
  return prefix + 'teams';
}
