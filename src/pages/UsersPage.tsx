import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Drawer,
  IconButton,
  Chip,
  Stack,
  Divider,
  ImageList,
  ImageListItem,
  Skeleton,
  Tooltip,
  Alert,
  Select,
  MenuItem,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabaseClient';
import type { User } from '../types/database';
import dayjs from 'dayjs';

// Supabase Storage 버킷 이름
const PHOTO_BUCKET = 'profile-photos';

type ApprovalStatus = 'approved' | 'pending' | 'rejected';

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string; color: 'success' | 'warning' | 'error' }[] = [
  { value: 'approved', label: '승인', color: 'success' },
  { value: 'pending', label: '대기', color: 'warning' },
  { value: 'rejected', label: '거절', color: 'error' },
];

async function fetchUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as User[];
}

async function updateApprovalStatus(userId: string, status: ApprovalStatus) {
  const { error } = await supabase
    .from('profiles')
    .update({ approval_status: status })
    .eq('id', userId);
  if (error) throw error;
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

async function fetchSignedPhotoUrls(rawValues: string[]) {
  if (!rawValues || rawValues.length === 0) return [];
  const paths = rawValues.map(extractStoragePath);
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 60 * 60);
  if (error) {
    console.error('[Profile Photos] Signed URL 발급 실패:', error);
    throw error;
  }
  return data?.map((item) => item.signedUrl).filter(Boolean) as string[];
}

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 100, renderCell: (p) => String(p.value ?? '').slice(0, 8) + '...' },
  { field: 'nickname', headerName: '닉네임', width: 130 },
  { field: 'gender', headerName: '성별', width: 80 },
  { field: 'age', headerName: '나이', width: 70, type: 'number' },
  { field: 'birth_date', headerName: '생년월일', width: 120 },
  {
    field: 'regions',
    headerName: '지역',
    width: 120,
    renderCell: (p) => (Array.isArray(p.value) ? (p.value as string[]).join(', ') : String(p.value ?? '')),
  },
  { field: 'mbti', headerName: 'MBTI', width: 90 },
  { field: 'smoking', headerName: '흡연', width: 90 },
  { field: 'drinking', headerName: '음주', width: 90 },
  { field: 'religion', headerName: '종교', width: 90 },
  {
    field: 'interests',
    headerName: '관심사',
    width: 160,
    renderCell: (p) => (Array.isArray(p.value) ? (p.value as string[]).join(', ') : String(p.value ?? '')),
  },
  {
    field: 'styles',
    headerName: '스타일',
    width: 160,
    renderCell: (p) => (Array.isArray(p.value) ? (p.value as string[]).join(', ') : String(p.value ?? '')),
  },
  { field: 'height', headerName: '키', width: 70, type: 'number' },
  { field: 'education', headerName: '학력', width: 100 },
  { field: 'school_name', headerName: '학교명', width: 120 },
  { field: 'job', headerName: '직업', width: 120 },
  { field: 'bio', headerName: '자기소개', width: 200 },
  { field: 'partner_filter', headerName: '상대방 필터', width: 120 },
  {
    field: 'approval_status',
    headerName: '승인상태',
    width: 110,
    renderCell: (p) => {
      const opt = APPROVAL_OPTIONS.find((o) => o.value === p.value);
      return (
        <Chip
          label={opt?.label ?? String(p.value ?? '-')}
          size="small"
          color={opt?.color ?? 'default'}
        />
      );
    },
  },
  {
    field: 'approved_at',
    headerName: '승인일',
    width: 160,
    renderCell: (p) => (p.value ? dayjs(p.value as string).format('YYYY-MM-DD HH:mm') : '-'),
  },
  { field: 'rejected_reason', headerName: '거절 사유', width: 160 },
  { field: 'candy_balance', headerName: '캔디', width: 80, type: 'number' },
  {
    field: 'is_test_data',
    headerName: '테스트',
    width: 80,
    renderCell: (p) => (p.value ? <Chip label="테스트" size="small" color="warning" /> : '-'),
  },
  {
    field: 'is_admin',
    headerName: '관리자',
    width: 80,
    renderCell: (p) => (p.value ? <Chip label="관리자" size="small" color="info" /> : '-'),
  },
  {
    field: 'created_at',
    headerName: '가입일',
    width: 160,
    renderCell: (p) => dayjs(p.value as string).format('YYYY-MM-DD HH:mm'),
  },
];

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editStatus, setEditStatus] = useState<ApprovalStatus | ''>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const photoPaths = selectedUser?.profile_photos ?? [];

  const {
    data: signedPhotoUrls = [],
    isLoading: photosLoading,
    error: photosError,
  } = useQuery({
    queryKey: ['profile-photos', selectedUser?.id, photoPaths],
    queryFn: () => fetchSignedPhotoUrls(photoPaths),
    enabled: photoPaths.length > 0,
    staleTime: 1000 * 60 * 50,
    retry: 1,
  });

  const filtered = data.filter(
    (u) =>
      !search ||
      u.nickname?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRowClick = (user: User) => {
    setSelectedUser(user);
    setEditStatus((user.approval_status as ApprovalStatus) ?? 'pending');
    setSaveError('');
    setSaveSuccess(false);
  };

  const handleCloseDrawer = () => {
    setSelectedUser(null);
    setEditStatus('');
    setSaveError('');
    setSaveSuccess(false);
  };

  const isStatusChanged = editStatus !== '' && editStatus !== selectedUser?.approval_status;

  const handleSaveClick = () => {
    if (!isStatusChanged) return;
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedUser || !editStatus) return;
    setConfirmOpen(false);
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      await updateApprovalStatus(selectedUser.id, editStatus as ApprovalStatus);
      // 로컬 상태 업데이트
      setSelectedUser({ ...selectedUser, approval_status: editStatus });
      // 목록 갱신
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const detailRows: [string, string | number | boolean | undefined][] = selectedUser
    ? [
        ['ID', selectedUser.id],
        ['디바이스 ID', selectedUser.device_id],
        ['닉네임', selectedUser.nickname],
        ['이메일', selectedUser.email],
        ['성별', selectedUser.gender],
        ['생년월일', selectedUser.birth_date],
        ['나이', selectedUser.age],
        ['지역', Array.isArray(selectedUser.regions) ? selectedUser.regions.join(', ') : selectedUser.regions],
        ['MBTI', selectedUser.mbti],
        ['흡연', selectedUser.smoking],
        ['음주', selectedUser.drinking],
        ['종교', selectedUser.religion],
        ['관심사', Array.isArray(selectedUser.interests) ? selectedUser.interests.join(', ') : selectedUser.interests],
        ['스타일', Array.isArray(selectedUser.styles) ? selectedUser.styles.join(', ') : selectedUser.styles],
        ['키', selectedUser.height ? `${selectedUser.height}cm` : '-'],
        ['학력', selectedUser.education],
        ['학교명', selectedUser.school_name],
        ['직업', selectedUser.job],
        ['자기소개', selectedUser.bio],
        ['상대방 필터', selectedUser.partner_filter],
        ['승인 상태', selectedUser.approval_status],
        ['승인일', selectedUser.approved_at ? dayjs(selectedUser.approved_at).format('YYYY-MM-DD HH:mm:ss') : '-'],
        ['거절 사유', selectedUser.rejected_reason],
        ['캔디 잔액', selectedUser.candy_balance?.toLocaleString()],
        ['FCM 토큰', selectedUser.fcm_token],
        ['테스트 데이터', selectedUser.is_test_data ? '예' : '아니오'],
        ['관리자', selectedUser.is_admin ? '예' : '아니오'],
        ['가입일', dayjs(selectedUser.created_at).format('YYYY-MM-DD HH:mm:ss')],
        ['수정일', selectedUser.updated_at ? dayjs(selectedUser.updated_at).format('YYYY-MM-DD HH:mm:ss') : '-'],
      ]
    : [];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        유저 관리
      </Typography>

      <Box sx={{ mb: 2 }}>
        <TextField
          placeholder="닉네임 또는 이메일 검색..."
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
          onRowClick={(p) => handleRowClick(p.row as User)}
          sx={{ border: 0, '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </Box>

      {/* 상세 Drawer */}
      <Drawer
        anchor="right"
        open={Boolean(selectedUser)}
        onClose={handleCloseDrawer}
        slotProps={{ paper: { sx: { width: 380, p: 3, overflowY: 'auto' } } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            유저 상세
          </Typography>
          <IconButton onClick={handleCloseDrawer}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />

        {selectedUser && (
          <Stack spacing={2}>
            {/* 프로필 사진 */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                프로필 사진 ({photoPaths.length}장)
              </Typography>

              {photoPaths.length === 0 ? (
                <Typography variant="body2" color="text.disabled">
                  등록된 사진 없음
                </Typography>
              ) : photosLoading ? (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {photoPaths.map((_, i) => (
                    <Skeleton key={i} variant="rectangular" width={100} height={100} sx={{ borderRadius: 2 }} />
                  ))}
                </Box>
              ) : photosError ? (
                <Box>
                  <Alert severity="error" sx={{ mb: 1, fontSize: 12 }}>
                    사진 로드 실패. 버킷명 확인: <strong>{PHOTO_BUCKET}</strong>
                  </Alert>
                  {photoPaths.map((p, i) => (
                    <Typography key={i} variant="caption" sx={{ display: 'block', wordBreak: 'break-all', color: 'text.secondary' }}>
                      {i + 1}. {p}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <ImageList cols={3} gap={8} sx={{ mt: 0, mb: 0 }}>
                  {signedPhotoUrls.map((url, idx) => (
                    <ImageListItem key={idx} sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                      <img
                        src={url}
                        alt={`프로필 ${idx + 1}`}
                        loading="lazy"
                        style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <Tooltip title="새 탭에서 열기">
                        <IconButton
                          size="small"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          component="a"
                          sx={{
                            position: 'absolute', top: 4, right: 4,
                            bgcolor: 'rgba(0,0,0,0.5)', color: 'white',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }, p: 0.5,
                          }}
                        >
                          <OpenInNewIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </ImageListItem>
                  ))}
                </ImageList>
              )}
            </Box>

            <Divider />

            {/* 승인 상태 변경 */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                승인 상태
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Select
                  value={editStatus}
                  onChange={(e) => {
                    setEditStatus(e.target.value as ApprovalStatus);
                    setSaveSuccess(false);
                    setSaveError('');
                  }}
                  size="small"
                  sx={{ flex: 1 }}
                >
                  {APPROVAL_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      <Chip label={opt.label} size="small" color={opt.color} sx={{ cursor: 'pointer' }} />
                    </MenuItem>
                  ))}
                </Select>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                  onClick={handleSaveClick}
                  disabled={!isStatusChanged || saving}
                  sx={{ whiteSpace: 'nowrap', px: 2 }}
                >
                  수정
                </Button>
              </Box>

              {saveSuccess && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  승인 상태가 변경되었습니다.
                </Alert>
              )}
              {saveError && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {saveError}
                </Alert>
              )}
            </Box>

            <Divider />

            {/* 유저 정보 */}
            {detailRows.map(([label, value]) => (
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

      {/* 확인 Dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>회원 정보 수정</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{selectedUser?.nickname}</strong> 님의 승인 상태를{' '}
            <strong>
              {APPROVAL_OPTIONS.find((o) => o.value === editStatus)?.label ?? editStatus}
            </strong>
            으로 변경하시겠습니까?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} variant="outlined" color="inherit">
            취소
          </Button>
          <Button onClick={handleConfirm} variant="contained" autoFocus>
            확인
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
