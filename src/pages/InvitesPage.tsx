import { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabaseAdmin } from '../api/supabaseClient';
import type { Referral, ReferralStatus } from '../types/database';

// 초대(referral). 지급은 DB 트리거(trg_referral_on_approval)가 가입 승인 시 자동 처리하므로
// 여기서는 설정(진행 여부·지급 쿠키)과 내역 조회만 한다. 승인은 Profiles 메뉴에서.

const STATUS_LABELS: Record<ReferralStatus, string> = { pending: '승인 대기', rewarded: '지급 완료' };
const STATUS_COLORS: Record<ReferralStatus, 'warning' | 'success'> = { pending: 'warning', rewarded: 'success' };
const APPROVAL_LABELS: Record<string, string> = {
  pending: '심사 중',
  approved: '승인',
  rejected: '반려',
  underaged: '미성년',
};
const DEFAULT_COOKIE = 100;

type Person = { nickname?: string; phone?: string | null; approval_status?: string };
type ReferralRow = Referral & {
  inviter_nickname: string;
  inviter_phone: string | null;
  invitee_phone: string | null;
  invitee_approval: string;
};
type InviteSetting = { enabled: boolean; cookie_amount: number };

async function fetchSetting(): Promise<InviteSetting> {
  const { data, error } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'invite_event').maybeSingle();
  if (error) throw error;
  const v = (data?.value ?? {}) as Partial<InviteSetting>;
  return { enabled: v.enabled !== false, cookie_amount: v.cookie_amount ?? DEFAULT_COOKIE };
}

async function saveSetting(s: InviteSetting) {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert({ key: 'invite_event', value: s, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function fetchReferrals(): Promise<ReferralRow[]> {
  const { data, error } = await supabaseAdmin
    .from('referrals')
    .select(
      '*, inviter:profiles!referrals_inviter_id_fkey(nickname, phone), invitee:profiles!referrals_invitee_id_fkey(nickname, phone, approval_status)',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const { inviter, invitee, ...rest } = r as Referral & { inviter?: Person; invitee?: Person };
    return {
      ...rest,
      inviter_nickname: inviter?.nickname ?? '(알 수 없음)',
      inviter_phone: inviter?.phone ?? null,
      invitee_nickname: invitee?.nickname ?? rest.invitee_nickname,
      invitee_phone: invitee?.phone ?? null,
      invitee_approval: invitee?.approval_status ?? '',
    };
  });
}

function SettingBar({ setting }: { setting: InviteSetting | undefined }) {
  const queryClient = useQueryClient();
  const [cookieInput, setCookieInput] = useState(String(setting?.cookie_amount ?? DEFAULT_COOKIE));
  const m = useMutation({
    mutationFn: saveSetting,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invite-setting'] }),
  });
  return (
    <>
      <FormControlLabel
        control={
          <Switch
            checked={setting?.enabled ?? true}
            disabled={!setting || m.isPending}
            onChange={(e) => setting && m.mutate({ ...setting, enabled: e.target.checked })}
          />
        }
        label={setting?.enabled === false ? '종료됨 (앱 초대 배너·가입 입력 숨김)' : '진행 중'}
      />
      <TextField
        label="1인당 지급 쿠키"
        type="number"
        size="small"
        value={cookieInput}
        onChange={(e) => setCookieInput(e.target.value)}
        sx={{ width: 150 }}
      />
      <Button
        variant="outlined"
        size="small"
        disabled={!setting || m.isPending || !(Number(cookieInput) > 0) || Number(cookieInput) === setting?.cookie_amount}
        onClick={() => setting && m.mutate({ ...setting, cookie_amount: Number(cookieInput) })}
      >
        저장
      </Button>
    </>
  );
}

export default function InvitesPage() {
  const { data: setting } = useQuery({ queryKey: ['invite-setting'], queryFn: fetchSetting });
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ['referrals'], queryFn: fetchReferrals });

  const pendingCount = useMemo(() => rows.filter((r) => r.status === 'pending').length, [rows]);
  const rewardedCookies = useMemo(
    () => rows.filter((r) => r.status === 'rewarded').reduce((sum, r) => sum + (r.cookie_amount ?? 0) * 2, 0),
    [rows],
  );

  const columns: GridColDef<ReferralRow>[] = [
    { field: 'inviter_nickname', headerName: '초대한 사람', width: 130 },
    { field: 'inviter_phone', headerName: '초대자 연락처', width: 140, valueGetter: (v: string | null) => v ?? '' },
    { field: 'code', headerName: '초대코드', width: 100 },
    { field: 'invitee_nickname', headerName: '가입한 사람', width: 130, valueGetter: (v: string | null) => v ?? '' },
    { field: 'invitee_phone', headerName: '가입자 연락처', width: 140, valueGetter: (v: string | null) => v ?? '' },
    {
      field: 'invitee_approval',
      headerName: '가입 심사',
      width: 100,
      valueGetter: (v: string) => APPROVAL_LABELS[v] ?? v,
    },
    {
      field: 'status',
      headerName: '쿠키',
      width: 110,
      renderCell: (p) => (
        <Chip label={STATUS_LABELS[p.value as ReferralStatus]} color={STATUS_COLORS[p.value as ReferralStatus]} size="small" />
      ),
    },
    { field: 'cookie_amount', headerName: '1인당', width: 80, valueGetter: (v: number | null) => (v ? `${v}개` : '') },
    { field: 'created_at', headerName: '가입 신청', width: 150, valueGetter: (v: string) => dayjs(v).format('YYYY.MM.DD HH:mm') },
    {
      field: 'rewarded_at',
      headerName: '지급 일시',
      width: 150,
      valueGetter: (v: string | null) => (v ? dayjs(v).format('YYYY.MM.DD HH:mm') : ''),
    },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          초대
          {pendingCount > 0 && <Chip label={`승인 대기 ${pendingCount}`} color="warning" size="small" sx={{ ml: 1 }} />}
          {rewardedCookies > 0 && (
            <Chip label={`지급 누계 ${rewardedCookies.toLocaleString()}개`} size="small" variant="outlined" sx={{ ml: 1 }} />
          )}
        </Typography>
        <SettingBar key={`${setting?.enabled}-${setting?.cookie_amount}`} setting={setting} />
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        가입자가 입력한 초대코드가 유효하면 여기에 쌓이고, Profiles 메뉴에서 <b>가입 승인</b>하는 순간 초대한 사람·가입한 사람
        모두에게 쿠키가 자동 지급됩니다 (쿠키 내역 유형 <code>invite_reward</code>).
      </Alert>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{String((error as Error).message)}</Alert>}

      <Box sx={{ height: 'calc(100vh - 260px)', bgcolor: 'background.paper', borderRadius: 2 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isLoading}
          disableRowSelectionOnClick
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={{ border: 0 }}
        />
      </Box>
    </Box>
  );
}
