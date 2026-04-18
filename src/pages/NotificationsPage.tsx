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
import type { Notification } from '../types/database';
import dayjs from 'dayjs';

async function fetchNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Notification[];
}

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 100, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'user_id', headerName: '유저 ID', width: 130, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'title', headerName: '제목', width: 200 },
  { field: 'body', headerName: '내용', width: 250, renderCell: (p) => String(p.value ?? '-') },
  {
    field: 'notification_type',
    headerName: '유형',
    width: 130,
    renderCell: (p) => (
      <Chip label={String(p.value ?? '-')} size="small" variant="outlined" />
    ),
  },
  {
    field: 'read_at',
    headerName: '읽음',
    width: 100,
    renderCell: (p) => (
      <Chip
        label={p.value ? '읽음' : '안읽음'}
        size="small"
        color={p.value ? 'success' : 'default'}
      />
    ),
  },
  {
    field: 'created_at',
    headerName: '전송일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

export default function NotificationsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Notification | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
  });

  const filtered = data.filter(
    (n) =>
      !search ||
      n.title?.toLowerCase().includes(search.toLowerCase()) ||
      n.body?.toLowerCase().includes(search.toLowerCase()) ||
      n.user_id?.includes(search)
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        알림 관리
      </Typography>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="제목, 내용 또는 유저 ID 검색..."
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
          onRowClick={(p) => setSelected(p.row as Notification)}
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
            알림 상세
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
                ['제목', selected.title],
                ['내용', selected.body],
                ['유형', selected.notification_type],
                ['읽은 시간', selected.read_at ? dayjs(selected.read_at).format('YYYY-MM-DD HH:mm') : '안읽음'],
                ['전송일', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
              ] as [string, string | undefined][]
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
