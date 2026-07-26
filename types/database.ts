export type Brand = "bros" | "girls";
export type RsvpStatus = "yes" | "maybe" | "no";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  brand: Brand;
  theme: string;
};

export type Group = {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  owner_id: string;
};

export type GroupRole = "owner" | "admin" | "member";

export type GroupMember = {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
};

export type EventItem = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  event_date: string;
  event_time: string | null;
  location: string;
  maps_url: string | null;
  location_lat: number | null;
  location_lng: number | null;
  place_id: string | null;
  details: string | null;
  cover_path: string | null;
  theme: string;
  is_pinned: boolean;
  created_at: string;
};

export type EventMedia = {
  id: string;
  event_id: string;
  group_id: string;
  uploaded_by: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
  signed_url?: string;
};

export type Vacation = {
  id: string;
  group_id: string;
  user_id: string;
  country: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type VacationInsert = {
  group_id: string;
  user_id: string;
  country: string;
  start_date: string;
  end_date: string;
  notes?: string | null;
};

export type VacationUpdate = {
  country?: string;
  start_date?: string;
  end_date?: string;
  notes?: string | null;
};
