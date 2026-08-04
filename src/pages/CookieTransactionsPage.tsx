import { useState } from 'react';
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
  Alert,
  Paper,
  Switch,
  FormControlLabel,
  Button,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import { supabaseAdmin } from '../api/supabaseClient';
import type { CookieTransaction } from '../types/database';
import dayjs from 'dayjs';

async function fetchCookieTransactions() {
  const { data, error } = await supabaseAdmin
    .from('cookie_transactions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CookieTransaction[];
}

/**
 * 가입 웰컴 쿠키 설정. app_settings.signup_bonus = {enabled, amount}.
 * 값을 읽는 건 앱이 아니라 profiles INSERT 트리거라서, 저장 즉시
 * 구버전 앱으로 가입하는 사람에게도 그대로 적용된다.
 */
function SignupBonusSetting() {
  const [enabled, setEnabled] = useState(true);
  const [amount, setAmount] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['app_settings', 'signup_bonus'],
    queryFn: async () => {
      const { data, error } = await supabaseAdmin
        .from('app_settings')
        .select('value')
        .eq('key', 'signup_bonus')
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? { enabled: true, amount: 0 }) as {
        enabled?: boolean;
        amount?: number;
      };
      setEnabled(v.enabled !== false);
      setAmount(String(v.amount ?? 0));
      return v;
    },
    staleTime: Infinity,
  });

  const parsed = parseInt(amount.trim(), 10);
  const invalid = enabled && (!Number.isFinite(parsed) || parsed < 0);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const { error } = await supabaseAdmin.from('app_settings').upsert({
      key: 'signup_bonus',
      value: { enabled, amount: enabled ? parsed : 0 },
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) setSaveError(error.message);
    else setSaved(true);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        가입 웰컴 쿠키
      </Typography>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControlLabel
          control={
            <Switch
              checked={enabled}
              disabled={isLoading}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setSaved(false);
              }}
            />
          }
          label={enabled ? '지급함' : '지급 안 함'}
        />
        <TextField
          size="small"
          label="지급 개수"
          value={amount}
          disabled={!enabled || isLoading}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^0-9]/g, ''));
            setSaved(false);
          }}
          error={invalid}
          sx={{ width: 140 }}
        />
        <Button variant="contained" onClick={save} disabled={invalid || saving || isLoading}>
          저장
        </Button>
        {saved && (
          <Typography variant="body2" color="success.main">
            저장됨 — 다음 가입자부터 적용
          </Typography>
        )}
        {saveError && (
          <Typography variant="body2" color="error.main">
            {saveError}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

type ChipColor = 'success' | 'error' | 'warning' | 'info' | 'default';

const transactionTypeColor = (type?: string): ChipColor => {
  const map: Record<string, ChipColor> = {
    purchase: 'success',
    use: 'error',
    refund: 'warning',
    admin_manual: 'info',
  };
  return map[type ?? ''] ?? 'default';
};

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 100, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'user_id', headerName: 'User ID', width: 130, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  {
    field: 'amount',
    headerName: 'Amount',
    width: 100,
    type: 'number',
    renderCell: (p) => {
      const amount = p.value as number;
      return (
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, color: amount >= 0 ? 'success.main' : 'error.main' }}
        >
          {amount >= 0 ? `+${amount}` : amount}
        </Typography>
      );
    },
  },
  {
    field: 'transaction_type',
    headerName: 'Type',
    width: 120,
    renderCell: (p) => (
      <Chip label={String(p.value ?? '-')} size="small" color={transactionTypeColor(p.value as string)} />
    ),
  },
  { field: 'description', headerName: 'Description', width: 220, renderCell: (p) => String(p.value ?? '-') },
  { field: 'balance_after', headerName: 'Balance after', width: 120, type: 'number' },
  {
    field: 'created_at',
    headerName: 'Created at',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

export default function CookieTransactionsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CookieTransaction | null>(null);

  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ['cookie_transactions'],
    queryFn: fetchCookieTransactions,
  });

  const filtered = data.filter(
    (t) =>
      !search ||
      t.user_id?.includes(search) ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.transaction_type?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Cookie Transactions
      </Typography>

      <SignupBonusSetting />

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load cookie transactions.'}
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="Search by user ID, type, or description..."
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
      </Box>

      <Box sx={{ height: 600, bgcolor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          onRowClick={(p) => setSelected(p.row as CookieTransaction)}
          sx={{ border: 0, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      <Drawer
        anchor="right"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        slotProps={{ paper: { sx: { width: 360, p: 3 } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Cookie transaction details
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
                ['User ID', selected.user_id],
                ['Amount', selected.amount >= 0 ? `+${selected.amount}` : String(selected.amount)],
                ['Type', selected.transaction_type],
                ['Description', selected.description],
                ['Balance after', selected.balance_after],
                ['Created at', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
              ] as [string, string | number | undefined][]
            ).map(([label, value]) => (
              <Box key={label as string}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
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
