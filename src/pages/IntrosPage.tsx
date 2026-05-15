import { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Drawer,
  IconButton,
  Stack,
  Divider,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import { supabaseAdmin } from '../api/supabaseClient';
import type { Intro } from '../types/database';
import dayjs from 'dayjs';

type IntroRow = Intro & {
  receiver?: { id: string; nickname: string | null } | null;
  card_profile?: { id: string; nickname: string | null } | null;
};

async function fetchIntros(): Promise<IntroRow[]> {
  // 1) intros 본문을 service_role 클라이언트로 조회 (RLS 우회)
  const { data: intros, error } = await supabaseAdmin
    .from('intros')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  const rows = (intros ?? []) as Intro[];

  // 2) 관련 프로필을 한 번에 조회한 뒤 매핑한다.
  //    (relational select 의 FK 제약 이름이 환경마다 다를 수 있어 별도 쿼리로 안전하게 처리)
  const profileIds = Array.from(
    new Set(rows.flatMap((r) => [r.receiver_id, r.card_profile_id])),
  ).filter(Boolean);

  let profileMap = new Map<string, { id: string; nickname: string | null }>();
  if (profileIds.length > 0) {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, nickname')
      .in('id', profileIds);
    if (profileError) throw profileError;
    profileMap = new Map(
      (profiles ?? []).map((p) => [
        (p as { id: string }).id,
        p as { id: string; nickname: string | null },
      ]),
    );
  }

  return rows.map((r) => ({
    ...r,
    receiver: profileMap.get(r.receiver_id) ?? null,
    card_profile: profileMap.get(r.card_profile_id) ?? null,
  }));
}

type ChipColor = 'success' | 'error' | 'warning' | 'info' | 'default';

const statusColor = (status?: string): ChipColor => {
  const map: Record<string, ChipColor> = {
    active: 'info',
    signal_sent: 'warning',
    matched: 'success',
    rejected: 'error',
    partner_deleted: 'default',
  };
  return map[status ?? ''] ?? 'default';
};

const sourceLabel = (source?: string): string => {
  const map: Record<string, string> = {
    daily_free: '오늘의 카드',
    daily_extra: '추가 카드',
  };
  return map[source ?? ''] ?? source ?? '-';
};

const columns: GridColDef<IntroRow>[] = [
  {
    field: 'id',
    headerName: 'ID',
    width: 110,
    renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...',
  },
  {
    field: 'receiver',
    headerName: '받은 유저',
    width: 160,
    valueGetter: (_v, row) => row.receiver?.nickname ?? row.receiver_id,
    renderCell: (p) => {
      const nick = p.row.receiver?.nickname;
      const id = p.row.receiver_id;
      return nick ? `${nick} (${id.slice(0, 6)})` : id.slice(0, 8) + '...';
    },
  },
  {
    field: 'card_profile',
    headerName: '카드 프로필',
    width: 160,
    valueGetter: (_v, row) => row.card_profile?.nickname ?? row.card_profile_id,
    renderCell: (p) => {
      const nick = p.row.card_profile?.nickname;
      const id = p.row.card_profile_id;
      return nick ? `${nick} (${id.slice(0, 6)})` : id.slice(0, 8) + '...';
    },
  },
  {
    field: 'source',
    headerName: '출처',
    width: 120,
    renderCell: (p) => (
      <Chip label={sourceLabel(p.value as string)} size="small" variant="outlined" />
    ),
  },
  {
    field: 'status',
    headerName: '상태',
    width: 130,
    renderCell: (p) => (
      <Chip label={String(p.value ?? '-')} size="small" color={statusColor(p.value as string)} />
    ),
  },
  {
    field: 'signal_id',
    headerName: '시그널 ID',
    width: 130,
    renderCell: (p) => (p.value ? String(p.value).slice(0, 8) + '...' : '-'),
  },
  {
    field: 'created_at',
    headerName: '발급일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
  {
    field: 'updated_at',
    headerName: '갱신일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

const STATUS_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'active', label: 'active' },
  { value: 'signal_sent', label: 'signal_sent' },
  { value: 'matched', label: 'matched' },
  { value: 'rejected', label: 'rejected' },
  { value: 'partner_deleted', label: 'partner_deleted' },
];

export default function IntrosPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<IntroRow | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['intros'],
    queryFn: fetchIntros,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.receiver_id.toLowerCase().includes(q) ||
        r.card_profile_id.toLowerCase().includes(q) ||
        (r.receiver?.nickname ?? '').toLowerCase().includes(q) ||
        (r.card_profile?.nickname ?? '').toLowerCase().includes(q) ||
        (r.signal_id ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        카드 발급(Intros) 내역
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        오늘의 카드 / 추가 카드 받기로 노출된 추천 카드 이력. 시그널 송신 → 매칭 흐름까지 추적.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
        <TextField
          placeholder="닉네임/유저 ID/시그널 ID 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: 360 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <ToggleButtonGroup
          size="small"
          value={statusFilter}
          exclusive
          onChange={(_, v) => v && setStatusFilter(v)}
        >
          {STATUS_FILTERS.map((s) => (
            <ToggleButton key={s.value} value={s.value} sx={{ textTransform: 'none' }}>
              {s.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Box
        sx={{
          height: 600,
          bgcolor: 'white',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(p) => setSelected(p.row as IntroRow)}
          sx={{ border: 0, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      <Drawer
        anchor="right"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        slotProps={{ paper: { sx: { width: 380, p: 3 } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            카드 상세
          </Typography>
          <IconButton onClick={() => setSelected(null)}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {selected && (
          <Stack spacing={1.5}>
            {(
              [
                ['ID', selected.id],
                [
                  '받은 유저',
                  selected.receiver?.nickname
                    ? `${selected.receiver.nickname} (${selected.receiver_id})`
                    : selected.receiver_id,
                ],
                [
                  '카드 프로필',
                  selected.card_profile?.nickname
                    ? `${selected.card_profile.nickname} (${selected.card_profile_id})`
                    : selected.card_profile_id,
                ],
                ['출처', sourceLabel(selected.source)],
                ['상태', selected.status],
                ['시그널 ID', selected.signal_id ?? '-'],
                ['발급일', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
                ['갱신일', dayjs(selected.updated_at).format('YYYY-MM-DD HH:mm:ss')],
              ] as [string, string | null | undefined][]
            ).map(([label, value]) => (
              <Box key={label as string}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>
                  {value ?? '-'}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Drawer>
    </Box>
  );
}
