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
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { ChatRoom } from '../types/database';
import dayjs from 'dayjs';

async function fetchChatRooms() {
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('*')
    .order('last_message_at', { ascending: false });
  if (error) throw error;
  return data as ChatRoom[];
}

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 120, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'match_id', headerName: '매칭 ID', width: 120, renderCell: (p) => (p.value ? String(p.value).slice(0, 8) + '...' : '-') },
  { field: 'user1_id', headerName: '유저 1', width: 130, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'user2_id', headerName: '유저 2', width: 130, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'last_message', headerName: '마지막 메시지', width: 220, renderCell: (p) => String(p.value ?? '-') },
  {
    field: 'last_message_at',
    headerName: '마지막 메시지 시간',
    width: 180,
    renderCell: (p) => (p.value ? dayjs(p.value as string).format('YYYY-MM-DD HH:mm') : '-'),
  },
  {
    field: 'created_at',
    headerName: '생성일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

export default function ChatRoomsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ChatRoom | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['chat_rooms'],
    queryFn: fetchChatRooms,
  });

  const filtered = data.filter(
    (r) =>
      !search ||
      r.user1_id?.includes(search) ||
      r.user2_id?.includes(search) ||
      r.last_message?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        채팅방 관리
      </Typography>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="유저 ID 또는 마지막 메시지 검색..."
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
          onRowClick={(p) => setSelected(p.row as ChatRoom)}
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
            채팅방 상세
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
                ['매칭 ID', selected.match_id],
                ['유저 1 ID', selected.user1_id],
                ['유저 2 ID', selected.user2_id],
                ['마지막 메시지', selected.last_message],
                ['마지막 메시지 시간', selected.last_message_at ? dayjs(selected.last_message_at).format('YYYY-MM-DD HH:mm') : '-'],
                ['생성일', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
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
