import type { Role } from "./types";

/** Signing into an existing profile never creates an account or assigns a new role. */
export function allowedProfileRoles(role: Role): readonly Role[] {
  return role === "admin" ? ["client", "developer", "admin"] : [role];
}
