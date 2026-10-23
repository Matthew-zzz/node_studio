export interface DeveloperAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: string | null;
  readonly createdBy: string | null;
}
export interface StaffState { readonly developers: readonly DeveloperAccount[] }
export interface CreateDeveloper { readonly type: "developer.create"; readonly requestId: string; readonly email: string; readonly name: string }
