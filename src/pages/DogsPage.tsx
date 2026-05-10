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
  ImageList,
  ImageListItem,
  Skeleton,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import { fetchSignedDogPhotoUrls } from '../lib/signedStorageUrls';
import type { Dog } from '../types/database';
import dayjs from 'dayjs';

const PHOTO_BUCKET = 'profile-photos';
const DOG_PHOTO_BUCKET = 'dog-photos';

async function fetchDogs() {
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Dog[];
}

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 100, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'owner_id', headerName: '소유자 ID', width: 120, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'name', headerName: '이름', width: 120 },
  { field: 'breed', headerName: '품종', width: 130 },
  { field: 'age', headerName: '나이', width: 70, type: 'number' },
  { field: 'gender', headerName: '성별', width: 80 },
  { field: 'size', headerName: '크기', width: 90 },
  {
    field: 'personalities',
    headerName: '성격',
    width: 180,
    renderCell: (p) =>
      Array.isArray(p.value) ? (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {(p.value as string[]).slice(0, 2).map((v) => (
            <Chip key={v} label={v} size="small" variant="outlined" />
          ))}
        </Box>
      ) : null,
  },
  {
    field: 'walk_styles',
    headerName: '산책 스타일',
    width: 180,
    renderCell: (p) =>
      Array.isArray(p.value) ? (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {(p.value as string[]).slice(0, 2).map((v) => (
            <Chip key={v} label={v} size="small" color="primary" variant="outlined" />
          ))}
        </Box>
      ) : null,
  },
  {
    field: 'created_at',
    headerName: '등록일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

export default function DogsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Dog | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['dogs'],
    queryFn: fetchDogs,
  });

  const photoPaths = useMemo(
    () => (selected?.photos ?? []).filter((p): p is string => Boolean(p?.trim())),
    [selected?.photos],
  );

  const { data: signedDogUrls = [], isLoading: dogPhotosLoading } = useQuery({
    queryKey: ['dogs-drawer-photos', selected?.id, photoPaths.join('\0')],
    queryFn: () => fetchSignedDogPhotoUrls(photoPaths, DOG_PHOTO_BUCKET, PHOTO_BUCKET),
    enabled: Boolean(selected) && photoPaths.length > 0,
  });

  const filtered = data.filter(
    (d) =>
      !search ||
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.breed?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        강아지 관리
      </Typography>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="이름 또는 품종 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ width: 300 }}
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
          onRowClick={(p) => setSelected(p.row as Dog)}
          sx={{ border: 0, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
          rowHeight={48}
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
            강아지 상세
          </Typography>
          <IconButton onClick={() => setSelected(null)}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {selected && (
          <Stack spacing={1.5}>
            {photoPaths.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  강아지 사진
                </Typography>
                {dogPhotosLoading ? (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    {photoPaths.map((_, i) => (
                      <Skeleton key={i} variant="rectangular" width={72} height={72} sx={{ borderRadius: 2 }} />
                    ))}
                  </Box>
                ) : (
                  <ImageList cols={3} gap={8} sx={{ mt: 1, mb: 0 }}>
                    {signedDogUrls.map((url, idx) => (
                      <ImageListItem key={idx}>
                        <img
                          src={url}
                          alt={`${selected.name}-${idx}`}
                          style={{ borderRadius: 8, width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                        />
                      </ImageListItem>
                    ))}
                  </ImageList>
                )}
              </Box>
            )}
            {selected.description?.trim() && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  소개 (description)
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                  {selected.description.trim()}
                </Typography>
              </Box>
            )}
            <Divider />
            {(
              [
                ['ID', selected.id],
                ['소유자 ID', selected.owner_id],
                ['이름', selected.name],
                ['품종', selected.breed],
                ['나이', selected.age],
                ['성별', selected.gender],
                ['크기', selected.size],
                ['등록일', dayjs(selected.created_at).format('YYYY-MM-DD HH:mm:ss')],
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
            <Box>
              <Typography variant="caption" color="text.secondary">성격</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {(selected.personalities ?? []).map((p) => (
                  <Chip key={p} label={p} size="small" />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">산책 스타일</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {(selected.walk_styles ?? []).map((w) => (
                  <Chip key={w} label={w} size="small" color="primary" variant="outlined" />
                ))}
              </Box>
            </Box>
          </Stack>
        )}
      </Drawer>
    </Box>
  );
}
