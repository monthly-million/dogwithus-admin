export interface User {
  id: string;
  email?: string;
  phone?: string;
  device_id?: string;
  nickname: string;
  gender?: string;
  birth_date?: string;
  age?: number;
  regions?: string[];
  mbti?: string;
  smoking?: string;
  drinking?: string;
  religion?: string;
  interests?: string[];
  styles?: string[];
  height?: number;
  education?: string;
  school_name?: string;
  job?: string;
  bio?: string;
  profile_photos?: string[];
  partner_filter?: string;
  approval_status?: string;
  approved_at?: string;
  rejected_reason?: string;
  cookie_balance?: number;
  fcm_token?: string;
  is_test_data?: boolean;
  is_admin?: boolean;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
  notifications_enabled?: boolean;
  suspended_at?: string;
  suspended_until?: string;
  suspended_reason?: string;
  notify_signals?: boolean;
  notify_messages?: boolean;
  notify_matches?: boolean;
  notify_announcements?: boolean;
}

export interface BlockedContact {
  id: string;
  owner_id: string;
  phone: string;
  created_at: string;
}

export interface Dog {
  id: string;
  owner_id: string;
  name: string;
  breed?: string;
  age?: number;
  gender?: string;
  size?: string;
  personalities?: string[];
  walk_styles?: string[];
  created_at: string;
}

export interface Signal {
  id: string;
  sender_id: string;
  receiver_id: string;
  signal_type?: string;
  message?: string;
  status?: string;
  expires_at?: string;
  candy_used?: number;
  created_at: string;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  signal_id?: string;
  created_at: string;
}

export type IntroSource = 'daily_free' | 'daily_extra' | 'admin_manual';
export type IntroStatus =
  | 'active'
  | 'signal_sent'
  | 'rejected'
  | 'matched'
  | 'partner_deleted';

export interface Intro {
  id: string;
  receiver_id: string;
  card_profile_id: string;
  source: IntroSource;
  status: IntroStatus;
  signal_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatRoom {
  id: string;
  match_id?: string;
  user1_id: string;
  user2_id: string;
  last_message?: string;
  last_message_at?: string;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  read_at?: string;
  created_at: string;
}

export interface CandyTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type?: string;
  description?: string;
  balance_after?: number;
  created_at: string;
}

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body?: string;
  notification_type?: string;
  read_at?: string;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  created_at: string;
}

export type PurchaseStatus = 'pending' | 'verified' | 'granted' | 'refunded' | 'failed' | 'canceled';
export type PurchaseStore = 'app_store' | 'play_store' | 'promo' | 'grant';

export interface Purchase {
  id: string;
  user_id: string;
  store: PurchaseStore;
  product_id: string;
  transaction_id: string | null;
  original_transaction_id: string | null;
  receipt_data: string | null;
  amount_krw: number;
  cookie_amount: number;
  cookie_transaction_id: string | null;
  status: PurchaseStatus;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
}

export type InquiryCategory = 'general' | 'account' | 'payment' | 'bug' | 'report' | 'other';
export type InquiryStatus = 'open' | 'in_progress' | 'answered' | 'closed';

export interface Inquiry {
  id: string;
  user_id: string;
  category: InquiryCategory;
  subject: string;
  body: string;
  status: InquiryStatus;
  admin_reply: string | null;
  admin_replied_at: string | null;
  created_at: string;
  updated_at: string;
}
