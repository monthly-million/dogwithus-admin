export interface User {
  id: string;
  email?: string;
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
  candy_balance?: number;
  fcm_token?: string;
  is_test_data?: boolean;
  is_admin?: boolean;
  created_at: string;
  updated_at?: string;
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
