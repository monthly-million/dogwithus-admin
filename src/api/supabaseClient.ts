import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_API_KEY as string;
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL과 Anon Key를 .env 파일에 설정해주세요.');
}

// 일반 클라이언트 (RLS 적용)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 관리자 클라이언트 (RLS 우회 – service_role 키)
// service_role 키가 없으면 일반 클라이언트로 fallback
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : supabase;
