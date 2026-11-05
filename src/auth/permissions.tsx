import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@/domain/types";
import { currentActor } from "./actor";

export const PERMISSIONS = [
  "incident.view",
  "incident.create",
  "incident.update",
  "incident.escalate",
  "incident.activate_irt",
  "incident.activate_crt",
  "incident.export",
  "guidance.edit",
  "guidance.publish",
  "contact.edit",
  "role.edit",
  "process.edit",
  "source.import",
  "rule.edit",
  "settings.edit",
  "admin.access",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Central permission check. Access control is not active yet, so every action is allowed.
 * Enforcement will be added here only — never in components.
 */
export function can(
  _action: Permission,
  _resource?: unknown,
  _user: User = currentActor(),
): boolean {
  return true;
}

const AuthCtx = createContext<{ user: User; can: typeof can }>({ user: currentActor(), can });

export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthCtx.Provider value={{ user: currentActor(), can }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

export function PermissionGate({
  action,
  resource,
  children,
  fallback = null,
}: {
  action: Permission;
  resource?: unknown;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(action, resource) ? children : fallback}</>;
}

/** Route guard used by the /admin layout. Currently always allows access. */
export function AdminGuard({ children }: { children: ReactNode }) {
  return (
    <PermissionGate
      action="admin.access"
      fallback={<p className="p-8">You do not have access to the Admin Console.</p>}
    >
      {children}
    </PermissionGate>
  );
}
