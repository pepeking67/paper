export type AccountUser = {
  id: string;
  email?: string;
};

export type AccountSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AccountUser;
};

export type AccountSyncStatus =
  | "local-only"
  | "signed-out"
  | "syncing"
  | "synced"
  | "pending"
  | "conflict"
  | "error";
