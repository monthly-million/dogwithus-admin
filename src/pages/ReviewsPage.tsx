import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  ImageList,
  ImageListItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CookieIcon from '@mui/icons-material/Cookie';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { supabaseAdmin } from '../api/supabaseClient';
import { fetchSignedUrlsForRefs } from '../lib/signedStorageUrls';
import type { ReviewChannel, ReviewStatus, ReviewSubmission } from '../types/database';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const CHANNEL_LABELS: Record<ReviewChannel, string> = {
  instagram: '인스타그램',
  blog: '블로그',
  threads: '스레드',
  community: '카페·커뮤니티',
  other: '기타',
};

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: '확인 중',
  approved: '지급 완료',
  rejected: '반려',
};
const STATUS_COLORS: Record<ReviewStatus, 'warning' | 'success' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'default',
};

const DEFAULT_COOKIE = 1000;
const REVIEW_BUCKET = 'review-photos';

type ReviewRow = ReviewSubmission & { nickname: string; phone: string | null };
type ReviewSetting = { enabled: boolean; cookie_amount: number };

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchSetting(): Promise<ReviewSetting> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'review_event')
    .maybeSingle();
  if (error) throw error;
  const v = (data?.value ?? {}) as Partial<ReviewSetting>;
  return { enabled: v.enabled !== false, cookie_amount: v.cookie_amount ?? DEFAULT_COOKIE };
}

async function saveSetting(s: ReviewSetting) {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert({ key: 'review_event', value: s, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function fetchReviews(): Promise<ReviewRow[]> {
  const { data, error } = await supabaseAdmin
    .from('review_submissions')
    .select('*, profiles!review_submissions_user_id_fkey(nickname, phone)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const p = (r as { profiles?: { nickname?: string; phone?: string | null } }).profiles;
    return { ...(r as ReviewSubmission), nickname: p?.nickname ?? '(알 수 없음)', phone: p?.phone ?? null };
  });
}

/** 승인: 쿠키 지급(거래 + 잔액) → 제출 상태 변경 → 인앱 알림 → 푸시. 어드민 수동 지급과 같은 순서. */
async function approveReview(row: ReviewRow, amount: number) {
  const { data: profile, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('cookie_balance')
    .eq('id', row.user_id)
    .single();
  if (pErr) throw pErr;
  const balanceAfter = (profile?.cookie_balance ?? 0) + amount;

  const { error: txErr } = await supabaseAdmin.from('cookie_transactions').insert({
    user_id: row.user_id,
    amount,
    transaction_type: 'review_reward',
    description: '함께하기 후기 쿠키',
    reference_id: row.id,
    balance_after: balanceAfter,
  });
  if (txErr) throw txErr;

  const { error: balErr } = await supabaseAdmin
    .from('profiles')
    .update({ cookie_balance: balanceAfter })
    .eq('id', row.user_id);
  if (balErr) throw balErr;

  const { error: upErr } = await supabaseAdmin
    .from('review_submissions')
    .update({ status: 'approved', cookie_amount: amount, processed_at: new Date().toISOString() })
    .eq('id', row.id);
  if (upErr) throw upErr;

  await supabaseAdmin.from('notifications').insert({
    user_id: row.user_id,
    title: '함께하기 쿠키가 지급되었어요 🍪',
    body: `후기 참여 고마워요! 쿠키 ${amount}개를 넣어드렸어요.`,
    notification_type: 'review_approved',
    reference_id: row.id,
  });

  const { error: pushError } = await supabaseAdmin.functions.invoke('send-push', {
    body: {
      type: 'review_approved',
      user_id: row.user_id,
      amount,
      balance_after: balanceAfter,
      submission_id: row.id,
    },
  });
  if (pushError) console.warn('[함께하기] 지급 푸시 발송 실패', pushError);
}

async function rejectReview(row: ReviewRow, reason: string) {
  const { error } = await supabaseAdmin
    .from('review_submissions')
    .update({ status: 'rejected', rejected_reason: reason || null, processed_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw error;
}

// ─── 상세 Drawer ───────────────────────────────────────────────────────────────

function ReviewDrawer(props: { row: ReviewRow | null; defaultCookie: number; onClose: () => void }) {
  // row 가 바뀌면 입력 상태(쿠키 개수/반려 사유)를 처음부터 — key 로 리마운트.
  return <ReviewDrawerInner key={`${props.row?.id ?? 'none'}-${props.defaultCookie}`} {...props} />;
}

function ReviewDrawerInner({
  row,
  defaultCookie,
  onClose,
}: {
  row: ReviewRow | null;
  defaultCookie: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [cookie, setCookie] = useState(String(defaultCookie));
  const [reason, setReason] = useState('');

  const images = row?.image_urls ?? [];
  const { data: imageUrls = [] } = useQuery({
    queryKey: ['review-images', row?.id],
    queryFn: () => fetchSignedUrlsForRefs(images, REVIEW_BUCKET),
    enabled: Boolean(row) && images.length > 0,
    staleTime: 1000 * 60 * 50,
  });

  const approve = useMutation({
    mutationFn: () => approveReview(row!, Number(cookie)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  const reject = useMutation({
    mutationFn: () => rejectReview(row!, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      onClose();
    },
  });

  const cookieNum = Number(cookie);
  const cookieValid = Number.isInteger(cookieNum) && cookieNum > 0;
  const busy = approve.isPending || reject.isPending;

  return (
    <Drawer
      anchor="right"
      open={Boolean(row)}
      onClose={busy ? undefined : onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 } } } }}
    >
      {row && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box
            sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
              함께하기 인증 상세
            </Typography>
            <Tooltip title="닫기">
              <IconButton onClick={onClose} size="small" disabled={busy}>
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {row.nickname}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {row.phone ?? row.user_id}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Chip label={CHANNEL_LABELS[row.channel] ?? row.channel} size="small" />
              <Chip label={STATUS_LABELS[row.status]} color={STATUS_COLORS[row.status]} size="small" variant="outlined" />
            </Stack>

            <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">인증완료</Typography>
                <Typography variant="body2">{dayjs(row.created_at).format('YYYY.MM.DD HH:mm')}</Typography>
              </Box>
              {row.processed_at && (
                <Box>
                  <Typography variant="caption" color="text.secondary">처리일시</Typography>
                  <Typography variant="body2">{dayjs(row.processed_at).format('YYYY.MM.DD HH:mm')}</Typography>
                </Box>
              )}
              {row.status === 'approved' && (
                <Box>
                  <Typography variant="caption" color="text.secondary">지급 쿠키</Typography>
                  <Typography variant="body2">{row.cookie_amount}개</Typography>
                </Box>
              )}
            </Stack>

            <Typography variant="caption" color="text.secondary">링크</Typography>
            {row.link ? (
              <Button
                size="small"
                href={row.link}
                target="_blank"
                rel="noopener noreferrer"
                endIcon={<OpenInNewIcon fontSize="small" />}
                sx={{ display: 'flex', justifyContent: 'flex-start', textTransform: 'none', wordBreak: 'break-all', mb: 2 }}
              >
                {row.link}
              </Button>
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>없음</Typography>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              캡처 이미지 ({images.length}장)
            </Typography>
            {images.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>없음</Typography>
            ) : (
              <ImageList cols={3} gap={8} sx={{ mt: 0, mb: 2 }}>
                {imageUrls.map((url, i) => (
                  <ImageListItem key={i} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`캡처 ${i + 1}`} loading="lazy" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                    </a>
                  </ImageListItem>
                ))}
              </ImageList>
            )}

            {row.rejected_reason && (
              <Alert severity="info" sx={{ mb: 2 }}>반려 사유: {row.rejected_reason}</Alert>
            )}

            {row.status === 'pending' && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>쿠키 지급하고 완료</Typography>
                <TextField
                  label="지급 쿠키 개수"
                  type="number"
                  size="small"
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                  error={!cookieValid}
                  helperText={cookieValid ? `지급 후 유저에게 푸시가 나갑니다 (기본 ${defaultCookie}개)` : '1 이상의 정수'}
                  sx={{ mb: 1.5, width: 220 }}
                />
                <Button
                  variant="contained"
                  startIcon={approve.isPending ? <CircularProgress size={14} color="inherit" /> : <CookieIcon />}
                  disabled={!cookieValid || busy}
                  onClick={() => {
                    if (window.confirm(`${row.nickname} 님에게 쿠키 ${cookieNum}개를 지급하고 완료 처리할까요?`)) approve.mutate();
                  }}
                  sx={{ display: 'block', mb: 3 }}
                >
                  쿠키 {cookieValid ? cookieNum.toLocaleString() : ''}개 지급하고 완료
                </Button>

                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>반려</Typography>
                <TextField
                  label="반려 사유 (유저에게 표시)"
                  size="small"
                  fullWidth
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  sx={{ mb: 1.5 }}
                />
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('반려 처리할까요? 쿠키는 지급되지 않습니다.')) reject.mutate();
                  }}
                >
                  반려 처리
                </Button>
              </>
            )}

            {(approve.isError || reject.isError) && (
              <Alert severity="error" sx={{ mt: 2 }}>
                처리 중 오류: {String((approve.error ?? reject.error as Error)?.message ?? '')}
              </Alert>
            )}
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

function SettingBar({ setting }: { setting: ReviewSetting | undefined }) {
  const queryClient = useQueryClient();
  const [cookieInput, setCookieInput] = useState(String(setting?.cookie_amount ?? DEFAULT_COOKIE));
  const settingMutation = useMutation({
    mutationFn: saveSetting,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['review-setting'] }),
  });
  return (
    <>
      <FormControlLabel
        control={
          <Switch
            checked={setting?.enabled ?? true}
            disabled={!setting || settingMutation.isPending}
            onChange={(e) => setting && settingMutation.mutate({ ...setting, enabled: e.target.checked })}
          />
        }
        label={setting?.enabled === false ? '종료됨 (앱 참여 버튼 비활성)' : '진행 중'}
      />
      <TextField
        label="기본 지급 쿠키"
        type="number"
        size="small"
        value={cookieInput}
        onChange={(e) => setCookieInput(e.target.value)}
        sx={{ width: 150 }}
      />
      <Button
        variant="outlined"
        size="small"
        disabled={!setting || settingMutation.isPending || !(Number(cookieInput) > 0) || Number(cookieInput) === setting?.cookie_amount}
        onClick={() => setting && settingMutation.mutate({ ...setting, cookie_amount: Number(cookieInput) })}
      >
        기본값 저장
      </Button>
    </>
  );
}

export default function ReviewsPage() {
  const [selected, setSelected] = useState<ReviewRow | null>(null);

  const { data: setting } = useQuery({ queryKey: ['review-setting'], queryFn: fetchSetting });
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const pendingCount = useMemo(() => rows.filter((r) => r.status === 'pending').length, [rows]);

  const columns: GridColDef<ReviewRow>[] = [
    { field: 'nickname', headerName: '닉네임', width: 120 },
    { field: 'channel', headerName: '채널', width: 110, valueGetter: (v: ReviewChannel) => CHANNEL_LABELS[v] ?? v },
    { field: 'link', headerName: '링크', flex: 1, minWidth: 200, valueGetter: (v: string | null) => v ?? '' },
    { field: 'image_urls', headerName: '캡처', width: 70, valueGetter: (v: string[]) => `${v?.length ?? 0}장` },
    {
      field: 'status',
      headerName: '상태',
      width: 110,
      renderCell: (p) => <Chip label={STATUS_LABELS[p.value as ReviewStatus]} color={STATUS_COLORS[p.value as ReviewStatus]} size="small" />,
    },
    { field: 'cookie_amount', headerName: '쿠키', width: 80, valueGetter: (v: number | null) => (v ? `${v}개` : '') },
    { field: 'created_at', headerName: '인증완료', width: 150, valueGetter: (v: string) => dayjs(v).format('YYYY.MM.DD HH:mm') },
    { field: 'processed_at', headerName: '처리일시', width: 150, valueGetter: (v: string | null) => (v ? dayjs(v).format('YYYY.MM.DD HH:mm') : '') },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, flex: 1 }}>
          함께하기 {pendingCount > 0 && <Chip label={`확인 중 ${pendingCount}`} color="warning" size="small" sx={{ ml: 1 }} />}
        </Typography>
        <SettingBar key={`${setting?.enabled}-${setting?.cookie_amount}`} setting={setting} />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{String((error as Error).message)}</Alert>}

      <Box sx={{ height: 'calc(100vh - 200px)', bgcolor: 'background.paper', borderRadius: 2 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isLoading}
          disableRowSelectionOnClick
          onRowClick={(p) => setSelected(p.row as ReviewRow)}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={{ border: 0, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      <ReviewDrawer row={selected} defaultCookie={setting?.cookie_amount ?? DEFAULT_COOKIE} onClose={() => setSelected(null)} />
    </Box>
  );
}
