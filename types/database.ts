export type Brand = "bros" | "girls";
export type AppLocale = "ro" | "en";
export type RsvpStatus = "yes" | "maybe" | "no";

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  brand: Brand;
  theme: string;
  locale: AppLocale;
  created_at?: string;
  last_seen_at?: string | null;
  account_status?: "active" | "suspended";
  suspended_at?: string | null;
  suspended_reason?: string | null;
};

export type AppAdminRole = "owner" | "admin";

export type AppAdmin = {
  user_id: string;
  role: AppAdminRole;
  created_at: string;
  created_by: string;
};

export type AdminAuditLog = {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
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

export type QuickPlanPreference = "weekend" | "weekdays" | "any";
export type QuickPlanStatus = "voting" | "completed" | "cancelled";
export type QuickPlanVoteValue = "yes" | "maybe" | "no";

export type QuickPlan = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  activity_key: string;
  activity_emoji: string;
  search_start: string;
  search_end: string;
  duration_days: number;
  preference: QuickPlanPreference;
  minimum_participants: number;
  status: QuickPlanStatus;
  created_at: string;
  updated_at: string;
};

export type QuickPlanContext = {
  conflicts: number;
  countries: Record<string, number>;
};

export type QuickPlanOption = {
  id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  rank: number;
  score: number;
  available_count: number;
  total_members: number;
  context: QuickPlanContext;
  created_at: string;
};

export type QuickPlanVote = {
  option_id: string;
  user_id: string;
  vote: QuickPlanVoteValue;
  comment: string | null;
  updated_at: string;
};

export type QuickPlanWithDetails = QuickPlan & {
  options: Array<QuickPlanOption & { votes: QuickPlanVote[] }>;
};

export type NotificationType =
  | "group_invitation" | "group_member_joined"
  | "event_created" | "event_updated" | "event_cancelled"
  | "quick_plan_created" | "quick_plan_vote_requested" | "quick_plan_voted"
  | "quick_plan_last_vote" | "quick_plan_confirmed" | "quick_plan_event_created"
  | "quick_plan_comment" | "vacation_created"
  | "event_tomorrow" | "quick_plan_response_due";

export type AppNotification = {
  id: string;
  user_id: string;
  group_id: string | null;
  actor_id: string | null;
  type: NotificationType;
  title?: string;
  message?: string;
  entity_type: "group" | "event" | "quick_plan" | "vacation" | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  actor?: Profile | null;
};

export type NotificationPreferences = {
  user_id: string;
  groups_enabled: boolean;
  events_enabled: boolean;
  quick_plans_enabled: boolean;
  vacations_enabled: boolean;
  reminders_enabled: boolean;
  updated_at: string;
};
