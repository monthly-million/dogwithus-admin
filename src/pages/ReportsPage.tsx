import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Avatar,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Stack,
  Divider,
  ImageList,
  ImageListItem,
  Skeleton,
  Tooltip,
} from '@mui/material';
import { DataGrid, type GridColDef, type GridRenderCellParams } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import ReportIcon from '@mui/icons-material/Report';
import { useQuery } from '@tanstack/react-query';
import { supabase, supabaseAdmin } from '../api/supabaseClient';
import type { Report, User } from '../types/database';
import dayjs from 'dayjs';

const PHOTO_BUCKET = 'profile-photos';

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchReports(): Promise<Report[]> {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Report[];
}

async function fetchUserById(userId: string): Promise<User> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data as User;
}

function extractStoragePath(value: string): string {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/object\/(?:public|sign)\/[^/]+\/(.+)/);
    if (match) return match[1];
    const match2 = url.pathname.match(/\/object\/authenticated\/[^/]+\/(.+)/);
    if (match2) return match2[1];
    return url.pathname.split('/').slice(-1)[0];
  } catch {
    return value;
  }
}

async function fetchSignedPhotoUrls(rawValues: string[]): Promise<string[]> {
  if (!rawValues || rawValues.length === 0) return [];
  const paths = rawValues.map(extractStoragePath);
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error) return [];
  return data?.map((item) => item.signedUrl).filter(Boolean) as string[];
}

// ─── UserProfileModal ─────────────────────────────────────────────────────────

function UserProfileModal({
  userId,
  label,
  open,
  onClose,
}: {
  userId: string;
  label: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchUserById(userId),
    enabled: open && !!userId,
  });

  const { data: photoUrls, isLoading: photosLoading } = useQuery({
    queryKey: ['profile-photos', userId, user?.profile_photos],
    queryFn: () => fetchSignedPhotoUrls(user?.profile_photos ?? []),
    enabled: open && !!user && (user.profile_photos?.length ?? 0) > 0,
  });

  const approvalColor = (status?: string) => {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'rejected') return 'error';
    return 'default';
  };

  const approvalLabel = (status?: string) => {
    if (status === 'approved') return '승인';
    if (status === 'pending') return '대기';
    if (status === 'rejected') return '거절';
    return status ?? '-';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
        <PersonIcon sx={{ color: 'primary.main' }} />
        {label} 유저 정보
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        )}
        {isError && (
          <Alert severity="error">유저 정보를 불러오는 데 실패했습니다.</Alert>
        )}
        {user && (
          <Stack spacing={2}>
            {/* 프로필 사진 */}
            {(user.profile_photos?.length ?? 0) > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  프로필 사진
                </Typography>
                {photosLoading ? (
                  <Box display="flex" gap={1} mt={1}>
                    {user.profile_photos?.map((_, i) => (
                      <Skeleton key={i} variant="rectangular" width={80} height={80} sx={{ borderRadius: 2 }} />
                    ))}
                  </Box>
                ) : (
                  <ImageList cols={4} gap={8} sx={{ mt: 1, mb: 0 }}>
                    {(photoUrls ?? []).map((url, idx) => (
                      <ImageListItem key={idx}>
                        <img
                          src={url}
                          alt={`photo-${idx}`}
                          style={{ borderRadius: 8, width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                        />
                      </ImageListItem>
                    ))}
                  </ImageList>
                )}
              </Box>
            )}

            <Divider />

            {/* 기본 정보 */}
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} gutterBottom display="block">
                기본 정보
              </Typography>
              <Stack spacing={0.75}>
                <InfoRow label="닉네임" value={user.nickname} />
                <InfoRow label="성별" value={user.gender} />
                <InfoRow label="나이" value={user.age != null ? `${user.age}세` : undefined} />
                <InfoRow label="생년월일" value={user.birth_date} />
                <InfoRow label="키" value={user.height != null ? `${user.height}cm` : undefined} />
                <InfoRow label="지역" value={user.regions?.join(', ')} />
                <InfoRow label="MBTI" value={user.mbti} />
              </Stack>
            </Box>

            <Divider />

            {/* 라이프스타일 */}
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} gutterBottom display="block">
                라이프스타일
              </Typography>
              <Stack spacing={0.75}>
                <InfoRow label="흡연" value={user.smoking} />
                <InfoRow label="음주" value={user.drinking} />
                <InfoRow label="종교" value={user.religion} />
                <InfoRow label="직업" value={user.job} />
                <InfoRow label="학력" value={user.education} />
                {user.interests && user.interests.length > 0 && (
                  <Box display="flex" gap={0.5} flexWrap="wrap" alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>관심사</Typography>
                    {user.interests.map((v) => <Chip key={v} label={v} size="small" />)}
                  </Box>
                )}
              </Stack>
            </Box>

            <Divider />

            {/* 계정 정보 */}
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} gutterBottom display="block">
                계정 정보
              </Typography>
              <Stack spacing={0.75}>
                <InfoRow label="승인 상태">
                  <Chip
                    label={approvalLabel(user.approval_status)}
                    color={approvalColor(user.approval_status) as 'success' | 'warning' | 'error' | 'default'}
                    size="small"
                  />
                </InfoRow>
                <InfoRow label="캔디 잔액" value={user.candy_balance != null ? `${user.candy_balance}개` : undefined} />
                <InfoRow label="가입일" value={dayjs(user.created_at).format('YYYY-MM-DD HH:mm')} />
                <InfoRow label="ID" value={user.id} mono />
              </Stack>
            </Box>

            {user.bio && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} gutterBottom display="block">
                    자기소개
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{user.bio}</Typography>
                </Box>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  if (!children && (value === undefined || value === null || value === '')) return null;
  return (
    <Box display="flex" alignItems="flex-start" gap={1}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80, flexShrink: 0 }}>
        {label}
      </Typography>
      {children ?? (
        <Typography variant="body2" sx={{ fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>
          {value}
        </Typography>
      )}
    </Box>
  );
}

// ─── UserChip ─────────────────────────────────────────────────────────────────

function UserChip({ userId, label }: { userId: string; label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title="클릭하여 유저 정보 확인">
        <Chip
          avatar={<Avatar sx={{ width: 20, height: 20, fontSize: 11 }}>{label[0]}</Avatar>}
          label={
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
              {userId.slice(0, 8)}…
            </Typography>
          }
          size="small"
          clickable
          color="primary"
          variant="outlined"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          sx={{ maxWidth: 160 }}
        />
      </Tooltip>
      <UserProfileModal
        userId={userId}
        label={label}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ─── ReportsPage ──────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [search, setSearch] = useState('');

  const { data: reports = [], isLoading, isError } = useQuery<Report[]>({
    queryKey: ['reports'],
    queryFn: fetchReports,
  });

  const filtered = reports.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.id.toLowerCase().includes(q) ||
      r.reporter_id.toLowerCase().includes(q) ||
      r.reported_id.toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q)
    );
  });

  const columns: GridColDef[] = [
    {
      field: 'created_at',
      headerName: '신고 일시',
      width: 160,
      renderCell: (params: GridRenderCellParams) =>
        dayjs(params.value as string).format('YYYY-MM-DD HH:mm'),
    },
    {
      field: 'reporter_id',
      headerName: '신고자',
      width: 180,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <UserChip userId={params.value as string} label="신고자" />
      ),
    },
    {
      field: 'reported_id',
      headerName: '신고당한 유저',
      width: 180,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <UserChip userId={params.value as string} label="신고당한 유저" />
      ),
    },
    {
      field: 'reason',
      headerName: '신고 사유',
      flex: 1,
      minWidth: 200,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" sx={{ whiteSpace: 'normal', lineHeight: 1.5, py: 0.5 }}>
          {params.value as string}
        </Typography>
      ),
    },
    {
      field: 'id',
      headerName: 'ID',
      width: 130,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
          {(params.value as string).slice(0, 8)}…
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      {/* 헤더 */}
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <ReportIcon sx={{ color: 'error.main', fontSize: 28 }} />
        <Typography variant="h5" fontWeight={700}>
          신고 내역
        </Typography>
        <Chip label={`총 ${reports.length}건`} size="small" color="error" variant="outlined" />
      </Box>

      {/* 검색 */}
      <Box mb={2}>
        <TextField
          size="small"
          placeholder="신고 사유, 유저 ID 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ width: 320 }}
        />
      </Box>

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          신고 내역을 불러오는 데 실패했습니다.
        </Alert>
      )}

      <Box
        sx={{
          bgcolor: 'white',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={isLoading}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableRowSelectionOnClick
          getRowHeight={() => 56}
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'grey.50',
              borderBottom: '1px solid',
              borderColor: 'divider',
            },
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
        />
      </Box>
    </Box>
  );
}
