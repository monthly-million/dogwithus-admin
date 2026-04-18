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
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { CandyTransaction } from '../types/database';
import dayjs from 'dayjs';

async function fetchCandyTransactions() {
  const { data, error } = await supabase
    .from('candy_transactions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as CandyTransaction[];
}

type ChipColor = 'success' | 'error' | 'warning' | 'default';

const transactionTypeColor = (type?: string): ChipColor => {
  const map: Record<string, ChipColor> = {
    purchase: 'success',
    use: 'error',
    refund: 'warning',
  };
  return map[type ?? ''] ?? 'default';
};

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 100, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'user_id', headerName: '유저 ID', width: 130, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  {
    field: 'amount',
    headerName: '금액',
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
    headerName: '거래 유형',
    width: 120,
    renderCell: (p) => (
      <Chip label={String(p.value ?? '-')} size="small" color={transactionTypeColor(p.value as string)} />
    ),
  },
  { field: 'description', headerName: '설명', width: 220, renderCell: (p) => String(p.value ?? '-') },
  { field: 'balance_after', headerName: '거래 후 잔액', width: 120, type: 'number' },
  {
    field: 'created_at',
    headerName: '거래일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

export default function CandyTransactionsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CandyTransaction | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['candy_transactions'],
    queryFn: fetchCandyTransactions,
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
        캔디 거래 관리
      </Typography>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="유저 ID, 거래 유형 또는 설명 검색..."
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
          onRowClick={(p) => setSelected(p.row as CandyTransaction)}
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
            캔디 거래 상세
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
                ['유저 ID', selected.user_id],
                ['금액', selected.amount >= 0 ? `+${selected.amount}` : String(selected.amount)],
                ['거래 유형', selected.transaction_type],
                ['설명', selected.description],
                ['거래 후 잔액', selected.balance_after],
                ['거래일', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
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
