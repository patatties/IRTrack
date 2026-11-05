# Authorization

Login and permission enforcement are **not active yet**. The foundations are in `src/auth`:

- `AuthProvider` / `useAuth()` — provides the current (demo) user.
- `can(action, resource)` — the single permission check. Returns `true` for now.
- `PermissionGate` — wraps admin actions (publish, edit contacts, activate CRT, settings, reset…).
- `AdminGuard` — route guard used by the `/admin` layout.
- `PERMISSIONS` — named permissions, e.g. `incident.activate_crt`, `guidance.publish`, `settings.edit`, `system.reset`.
- Audit actor fields (`createdBy`, `updatedBy`, audit `actor`) come from `currentActor()`.
- Incident visibility: `maskIncident()` in `src/domain/rules.ts` is the central confidentiality rule for wallboard, executive and portal views.

## Planned roles

| Role             | Typical permissions                                   |
| ---------------- | ----------------------------------------------------- |
| Employee         | portal only, create report, track                     |
| Incident handler | incident.view/update, tasks, comms                    |
| Incident manager | + escalate, activate IRT, deadlines                   |
| Crisis manager   | + activate/stand down CRT                             |
| Content editor   | guidance.edit, contact.edit                           |
| Content owner    | + guidance.publish                                    |
| Administrator    | settings.edit, source.import, system.reset, role.edit |

## Activating enforcement

1. Implement login (OIDC recommended) in `AuthProvider` and call `setActor()`.
2. Replace the body of `can()` with a role → permission lookup (and resource checks, e.g. confidential incidents).
3. The backend must enforce the same permissions; the frontend checks are for UX only.
