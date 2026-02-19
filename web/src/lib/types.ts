export type Permission =
  | "view"
  | "add"
  | "edit"
  | "delete"
  | "manage"
  | "manage_users";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  access_level: string;
};

export type Lot = {
  id: string;
  lot_name: string;
  description: string | null;
  status: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

