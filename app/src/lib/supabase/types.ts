/* Hand-written row types for the tables in
   supabase/migrations/20260826042223_movienight_auth_and_uploads.sql.
   Regenerate-by-hand when the migration changes; there is no codegen without
   a linked project. */

export type Profile = {
  id: string;
  letterboxd_username: string;
  display_name: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FriendshipStatus = "pending" | "accepted";

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
};

/** Edge row with both profiles embedded (PostgREST FK joins). */
export type FriendshipEdge = FriendshipRow & {
  requester: Profile;
  addressee: Profile;
};

export type UploadStatus = "uploaded" | "imported" | "rejected";

export type UploadRow = {
  id: string;
  user_id: string;
  object_path: string;
  file_name: string;
  size_bytes: number;
  stats: Record<string, unknown>;
  status: UploadStatus;
  created_at: string;
  imported_at: string | null;
};
