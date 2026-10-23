import type { Role } from "./types";

/** Signing into an existing profile never creates an account or assigns a new role. */
export function allowedProfileRoles(role: Role): readonly Role[] {
  if (role === "admin") return ["client", "developer", "admin"];
  return role === "developer" ? ["developer", "admin"] : ["client"];
}
