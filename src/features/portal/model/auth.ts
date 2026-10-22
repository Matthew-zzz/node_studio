import type { PortalSnapshot, Role } from "./types";

export interface EmailChallenge {
  readonly kind: "verification";
  readonly email: string;
  readonly role: Role;
  readonly expiresAt: number;
  readonly resendAt: number;
}
export type LoginResult = PortalSnapshot | EmailChallenge;
export interface RecoveryDetails { readonly email: string; readonly expiresAt: number }
