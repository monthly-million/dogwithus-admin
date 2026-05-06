import { useState, useMemo } from 'react';
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PendingIcon from '@mui/icons-material/HourglassEmpty';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import CookieIcon from '@mui/icons-material/Cookie';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { Purchase, PurchaseStatus, PurchaseStore } from '../types/database';
import dayjs from 'dayjs';

async function fetchPurchases() {
  const { data, error } = await supabase
    .from('purchases')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Purchase[];
}

async function updatePurchaseStatus(id: string, status: PurchaseStatus, failureReason?: string) {
  const payload: Partial<Purchase> = { status, updated_at: new Date().toISOString() };
  if (failureReason) payload.failure_reason = failureReason;
  const { error } = await supabase.from('purchases').update(payload).eq('id', id);
  if (error) throw error;
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PurchaseStatus, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary' | 'secondary' }> = {
  pending:  { label: '대기중',   color: 'warning' },
  verified: { label: '검증완료', color: 'info' },
  granted:  { label: '지급완료', color: 'success' },
  refunded: { label: '환불',     color: 'secondary' },
  failed:   { label: '실패',     color: 'error' },
  canceled: { label: '취소',     color: 'default' },
};

const STORE_CONFIG: Record<PurchaseStore, { label: string; color: 'default' | 'primary' | 'secondary' | 'info' }> = {
  app_store:  { label: 'App Store',  color: 'primary' },
  play_store: { label: 'Play Store', color: 'info' },
  promo:      { label: '프로모션',   color: 'secondary' },
  grant:      { label: '수동지급',   color: 'default' },
};

const ALL_STATUSES: PurchaseStatus[] = ['pending', 'verified', 'granted', 'refunded', 'failed', 'canceled'];
const ALL_STORES: PurchaseStore[] = ['app_store', 'play_store', 'promo', 'grant'];

// ─── 컬럼 ─────────────────────────────────────────────────────────────────────

const columns: GridColDef[] = [
  {
    field: 'id',
    headerName: 'ID',
    width: 110,
    renderCell: (p) => (
      <Tooltip title={String(p.value ?? '')}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
          {String(p.value ?? '').slice(0, 8)}…
        </Typography>
      </Tooltip>
    ),
  },
  {
    field: 'user_id',
    headerName: '유저 ID',
    width: 110,
    renderCell: (p) => (
      <Tooltip title={String(p.value ?? '')}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
          {String(p.value ?? '').slice(0, 8)}…
        </Typography>
      </Tooltip>
    ),
  },
  {
    field: 'store',
    headerName: '스토어',
    width: 110,
    renderCell: (p) => {
      const cfg = STORE_CONFIG[p.value as PurchaseStore];
      return cfg ? (
        <Chip label={cfg.label} size="small" color={cfg.color} variant="outlined" />
      ) : (
        <Typography variant="body2">{String(p.value ?? '-')}</Typography>
      );
    },
  },
  { field: 'product_id', headerName: '상품 ID', width: 150 },
  {
    field: 'amount_krw',
    headerName: '결제금액(₩)',
    width: 120,
    type: 'number',
    renderCell: (p) => (
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {Number(p.value ?? 0).toLocaleString()}원
      </Typography>
    ),
  },
  {
    field: 'cookie_amount',
    headerName: '쿠키',
    width: 90,
    type: 'number',
    renderCell: (p) => (
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.dark' }}>
        🍪 {Number(p.value ?? 0).toLocaleString()}
      </Typography>
    ),
  },
  {
    field: 'status',
    headerName: '상태',
    width: 110,
    renderCell: (p) => {
      const cfg = STATUS_CONFIG[p.value as PurchaseStatus];
      return cfg ? (
        <Chip label={cfg.label} size="small" color={cfg.color} />
      ) : (
        <Typography variant="body2">{String(p.value ?? '-')}</Typography>
      );
    },
  },
  {
    field: 'transaction_id',
    headerName: '트랜잭션 ID',
    width: 160,
    renderCell: (p) =>
      p.value ? (
        <Tooltip title={String(p.value)}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
            {String(p.value).slice(0, 16)}…
          </Typography>
        </Tooltip>
      ) : (
        <Typography variant="body2" color="text.disabled">-</Typography>
      ),
  },
  {
    field: 'created_at',
    headerName: '결제일시',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
  {
    field: 'verified_at',
    headerName: '검증일시',
    width: 160,
    renderCell: (p) =>
      p.value ? dayjs(p.value as string).format('YYYY-MM-DD HH:mm') : (
        <Typography variant="body2" color="text.disabled">-</Typography>
      ),
  },
];

// ─── 통계 카드 ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ title, value, sub, icon, color }: StatCardProps) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '16px !important' }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            {title}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" color="text.secondary">
              {sub}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | 'all'>('all');
  const [storeFilter, setStoreFilter] = useState<PurchaseStore | 'all'>('all');
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [actionDialog, setActionDialog] = useState<{ type: 'refund' | 'cancel' | 'grant'; purchase: Purchase } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: fetchPurchases,
  });

  const filtered = useMemo(() => {
    return data.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (storeFilter !== 'all' && p.store !== storeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.user_id.includes(q) ||
          p.product_id.toLowerCase().includes(q) ||
          (p.transaction_id ?? '').toLowerCase().includes(q) ||
          (p.original_transaction_id ?? '').toLowerCase().includes(q) ||
          p.id.includes(q)
        );
      }
      return true;
    });
  }, [data, search, statusFilter, storeFilter]);

  const stats = useMemo(() => {
    const total = data.length;
    const granted = data.filter((p) => p.status === 'granted').length;
    const pending = data.filter((p) => p.status === 'pending').length;
    const failed = data.filter((p) => p.status === 'failed' || p.status === 'canceled').length;
    const totalAmountKrw = data
      .filter((p) => p.status === 'granted')
      .reduce((acc, p) => acc + p.amount_krw, 0);
    const totalCookies = data
      .filter((p) => p.status === 'granted')
      .reduce((acc, p) => acc + p.cookie_amount, 0);
    return { total, granted, pending, failed, totalAmountKrw, totalCookies };
  }, [data]);

  const handleAction = async () => {
    if (!actionDialog) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const statusMap = { refund: 'refunded', cancel: 'canceled', grant: 'granted' } as const;
      await updatePurchaseStatus(actionDialog.purchase.id, statusMap[actionDialog.type]);
      await queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setActionDialog(null);
      setSelected(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        결제 내역 관리
      </Typography>

      {/* 통계 카드 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="전체 건수"
            value={stats.total.toLocaleString()}
            icon={<ShoppingCartIcon fontSize="small" />}
            color="#6c757d"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="지급 완료"
            value={stats.granted.toLocaleString()}
            icon={<CheckCircleIcon fontSize="small" />}
            color="#2e7d32"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="대기중"
            value={stats.pending.toLocaleString()}
            icon={<PendingIcon fontSize="small" />}
            color="#e65100"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="실패/취소"
            value={stats.failed.toLocaleString()}
            icon={<CancelIcon fontSize="small" />}
            color="#c62828"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="총 매출 (지급완료)"
            value={`${stats.totalAmountKrw.toLocaleString()}원`}
            icon={<MonetizationOnIcon fontSize="small" />}
            color="#1565c0"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <StatCard
            title="총 지급 쿠키"
            value={stats.totalCookies.toLocaleString()}
            icon={<CookieIcon fontSize="small" />}
            color="#f9a825"
          />
        </Grid>
      </Grid>

      {/* 검색 및 필터 */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          placeholder="ID, 유저 ID, 상품 ID, 트랜잭션 ID 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: { xs: '100%', sm: 360 } }}
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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>상태</InputLabel>
          <Select
            label="상태"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PurchaseStatus | 'all')}
          >
            <MenuItem value="all">전체</MenuItem>
            {ALL_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>스토어</InputLabel>
          <Select
            label="스토어"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value as PurchaseStore | 'all')}
          >
            <MenuItem value="all">전체</MenuItem>
            {ALL_STORES.map((s) => (
              <MenuItem key={s} value={s}>
                {STORE_CONFIG[s].label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {filtered.length.toLocaleString()}건
        </Typography>
      </Stack>

      {/* 데이터 그리드 */}
      <Box sx={{ height: 600, bgcolor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(p) => setSelected(p.row as Purchase)}
          sx={{ border: 0, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      {/* 상세 드로어 */}
      <Drawer
        anchor="right"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 420 }, p: 3 } } }}
      >
        {selected && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                결제 상세
              </Typography>
              <IconButton onClick={() => setSelected(null)} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
            <Divider sx={{ mb: 2 }} />

            {/* 상태 배지 */}
            <Box sx={{ mb: 2 }}>
              {(() => {
                const cfg = STATUS_CONFIG[selected.status];
                return cfg ? <Chip label={cfg.label} color={cfg.color} /> : null;
              })()}
            </Box>

            <Stack spacing={2}>
              {(
                [
                  ['결제 ID', selected.id],
                  ['유저 ID', selected.user_id],
                  ['스토어', STORE_CONFIG[selected.store]?.label ?? selected.store],
                  ['상품 ID', selected.product_id],
                  ['결제금액', `${selected.amount_krw.toLocaleString()}원`],
                  ['지급 쿠키', `🍪 ${selected.cookie_amount.toLocaleString()}`],
                  ['트랜잭션 ID', selected.transaction_id ?? '-'],
                  ['원본 트랜잭션 ID', selected.original_transaction_id ?? '-'],
                  ['쿠키 트랜잭션 ID', selected.cookie_transaction_id ?? '-'],
                  ['실패 사유', selected.failure_reason ?? '-'],
                  ['결제일시', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
                  ['수정일시', dayjs(selected.updated_at).format('YYYY-MM-DD HH:mm:ss')],
                  ['검증일시', selected.verified_at ? dayjs(selected.verified_at).format('YYYY-MM-DD HH:mm:ss') : '-'],
                ] as [string, string][]
              ).map(([label, value]) => (
                <Box key={label}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 500,
                      wordBreak: 'break-all',
                      fontFamily: label.includes('ID') ? 'monospace' : undefined,
                      fontSize: label.includes('ID') && value.length > 20 ? 11 : undefined,
                    }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Divider sx={{ my: 3 }} />

            {/* 액션 버튼 */}
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                상태 변경
              </Typography>
              {selected.status === 'pending' || selected.status === 'verified' ? (
                <Button
                  variant="contained"
                  color="success"
                  fullWidth
                  onClick={() => setActionDialog({ type: 'grant', purchase: selected })}
                >
                  수동 지급 (granted)
                </Button>
              ) : null}
              {selected.status === 'granted' ? (
                <Button
                  variant="outlined"
                  color="warning"
                  fullWidth
                  onClick={() => setActionDialog({ type: 'refund', purchase: selected })}
                >
                  환불 처리 (refunded)
                </Button>
              ) : null}
              {selected.status !== 'canceled' && selected.status !== 'refunded' ? (
                <Button
                  variant="outlined"
                  color="error"
                  fullWidth
                  onClick={() => setActionDialog({ type: 'cancel', purchase: selected })}
                >
                  취소 처리 (canceled)
                </Button>
              ) : null}
              {selected.status === 'canceled' || selected.status === 'refunded' ? (
                <Alert severity="info" sx={{ fontSize: 13 }}>
                  이미 {STATUS_CONFIG[selected.status].label} 상태입니다.
                </Alert>
              ) : null}
            </Stack>
          </>
        )}
      </Drawer>

      {/* 확인 다이얼로그 */}
      <Dialog open={Boolean(actionDialog)} onClose={() => !actionLoading && setActionDialog(null)}>
        <DialogTitle>
          {actionDialog?.type === 'grant' && '수동 지급 처리'}
          {actionDialog?.type === 'refund' && '환불 처리'}
          {actionDialog?.type === 'cancel' && '취소 처리'}
        </DialogTitle>
        <DialogContent>
          {actionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {actionError}
            </Alert>
          )}
          <DialogContentText>
            {actionDialog?.type === 'grant' &&
              `결제 ID ${actionDialog.purchase.id.slice(0, 8)}...을 지급 완료(granted) 상태로 변경하시겠습니까?`}
            {actionDialog?.type === 'refund' &&
              `결제 ID ${actionDialog?.purchase.id.slice(0, 8)}...을 환불 처리(refunded) 상태로 변경하시겠습니까?`}
            {actionDialog?.type === 'cancel' &&
              `결제 ID ${actionDialog?.purchase.id.slice(0, 8)}...을 취소(canceled) 상태로 변경하시겠습니까?`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog(null)} disabled={actionLoading}>
            취소
          </Button>
          <Button
            variant="contained"
            color={actionDialog?.type === 'grant' ? 'success' : actionDialog?.type === 'refund' ? 'warning' : 'error'}
            onClick={handleAction}
            disabled={actionLoading}
            startIcon={actionLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            확인
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
