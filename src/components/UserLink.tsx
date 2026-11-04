import { Link } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';

/** 전체 프로필 닉네임 맵 — 시그널/매칭/카드 목록에서 유저 ID 대신 닉네임을 보여주기 위함. */
export function useProfileNames() {
  const { data } = useQuery({
    queryKey: ['profile-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nickname');
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.nickname as string | null]));
    },
    staleTime: 1000 * 60 * 5,
  });
  return data ?? {};
}

/** 유저 ID → "닉네임 (id앞6자리)" 링크. 클릭 시 Profiles 페이지 상세 Drawer 를 새 탭에서 연다. */
export default function UserLink({ userId }: { userId?: string | null }) {
  const names = useProfileNames();
  if (!userId) return <>-</>;
  const nick = names[userId];
  return (
    <Link
      href={`#/profiles?user=${userId}`}
      target="_blank"
      rel="noopener"
      underline="hover"
      onClick={(e) => e.stopPropagation()}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 500 }}
    >
      {nick ? `${nick} (${userId.slice(0, 6)})` : userId.slice(0, 8) + '...'}
      <OpenInNewIcon sx={{ fontSize: 14 }} />
    </Link>
  );
}
