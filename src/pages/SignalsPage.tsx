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
import type { Signal } from '../types/database';
import dayjs from 'dayjs';

async function fetchSignals() {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Signal[];
}

type ChipColor = 'success' | 'error' | 'warning' | 'default';

const statusColor = (status?: string): ChipColor => {
  const map: Record<string, ChipColor> = {
    accepted: 'success',
    rejected: 'error',
    pending: 'warning',
    expired: 'default',
  };
  return map[status ?? ''] ?? 'default';
};

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 100, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'sender_id', headerName: '보낸 유저', width: 130, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'receiver_id', headerName: '받은 유저', width: 130, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'signal_type', headerName: '타입', width: 100 },
  { field: 'message', headerName: '메시지', width: 200, renderCell: (p) => String(p.value ?? '-') },
  {
    field: 'status',
    headerName: '상태',
    width: 100,
    renderCell: (p) => (
      <Chip label={String(p.value ?? '-')} size="small" color={statusColor(p.value as string)} />
    ),
  },
  {
    field: 'expires_at',
    headerName: '만료일',
    width: 160,
    renderCell: (p) => (p.value ? dayjs(p.value as string).format('YYYY-MM-DD HH:mm') : '-'),
  },
  { field: 'candy_used', headerName: '캔디 사용', width: 100, type: 'number' },
  {
    field: 'created_at',
    headerName: '생성일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

export default function SignalsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Signal | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['signals'],
    queryFn: fetchSignals,
  });

  const filtered = data.filter(
    (s) =>
      !search ||
      s.sender_id?.includes(search) ||
      s.receiver_id?.includes(search) ||
      s.message?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        시그널 관리
      </Typography>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="보낸/받은 유저 ID 또는 메시지 검색..."
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
          onRowClick={(p) => setSelected(p.row as Signal)}
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
            시그널 상세
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
                ['보낸 유저 ID', selected.sender_id],
                ['받은 유저 ID', selected.receiver_id],
                ['타입', selected.signal_type],
                ['메시지', selected.message],
                ['상태', selected.status],
                ['만료일', selected.expires_at ? dayjs(selected.expires_at).format('YYYY-MM-DD HH:mm') : '-'],
                ['캔디 사용', selected.candy_used],
                ['생성일', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
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
