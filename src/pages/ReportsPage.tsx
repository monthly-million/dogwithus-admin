import { useMemo, useState } from 'react';
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
import PetsIcon from '@mui/icons-material/Pets';
import ReportIcon from '@mui/icons-material/Report';
import { useQuery } from '@tanstack/react-query';
import { supabase, supabaseAdmin } from '../api/supabaseClient';
import { fetchSignedDogPhotoUrls, fetchSignedUrlsForRefs } from '../lib/signedStorageUrls';
import type { Dog, Report, User } from '../types/database';
import dayjs from 'dayjs';

const PHOTO_BUCKET = 'profile-photos';
const DOG_PHOTO_BUCKET = 'dog-photos';

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

async function fetchDogsByOwnerId(ownerId: string): Promise<Dog[]> {
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Dog[];
}

function dogPhotoPaths(dog: Dog): string[] {
  return (dog.photos ?? []).filter((p): p is string => Boolean(p?.trim()));
}

function dogDescription(dog: Dog): string | undefined {
  const t = dog.description?.trim();
  return t || undefined;
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
    queryFn: () => fetchSignedUrlsForRefs(user?.profile_photos ?? [], PHOTO_BUCKET),
    enabled: open && !!user && (user.profile_photos?.length ?? 0) > 0,
  });

  const {
    data: dogs = [],
    isLoading: dogsLoading,
    isError: dogsIsError,
  } = useQuery({
    queryKey: ['dogs-by-owner', userId],
    queryFn: () => fetchDogsByOwnerId(userId),
    enabled: open && !!userId,
  });

  const dogPhotoPathsGrouped = useMemo(() => dogs.map(dogPhotoPaths), [dogs]);
  const allDogPhotoPathsFlat = useMemo(() => dogPhotoPathsGrouped.flat(), [dogPhotoPathsGrouped]);

  const { data: dogSignedUrls = [], isLoading: dogPhotosLoading } = useQuery({
    queryKey: ['report-modal-dog-photos', userId, allDogPhotoPathsFlat.join('\0')],
    queryFn: () => fetchSignedDogPhotoUrls(allDogPhotoPathsFlat, DOG_PHOTO_BUCKET, PHOTO_BUCKET),
    enabled: open && allDogPhotoPathsFlat.length > 0,
  });

  const dogPhotoUrlsByDog = useMemo(() => {
    let offset = 0;
    return dogPhotoPathsGrouped.map((paths) => {
      const slice = dogSignedUrls.slice(offset, offset + paths.length);
      offset += paths.length;
      return slice;
    });
  }, [dogPhotoPathsGrouped, dogSignedUrls]);

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
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
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
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  프로필 사진
                </Typography>
                {photosLoading ? (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
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

            {/* 강아지 (신고 맥락: 사진·소개 확인) */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PetsIcon sx={{ fontSize: 16 }} />
                강아지
              </Typography>
              {dogsLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={28} />
                </Box>
              )}
              {dogsIsError && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  강아지 정보를 불러오지 못했습니다.
                </Alert>
              )}
              {!dogsLoading && !dogsIsError && dogs.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  등록된 강아지가 없습니다.
                </Typography>
              )}
              {!dogsLoading && !dogsIsError &&
                dogs.map((dog, dogIdx) => {
                  const paths = dogPhotoPathsGrouped[dogIdx] ?? [];
                  const urls = dogPhotoUrlsByDog[dogIdx] ?? [];
                  const intro = dogDescription(dog);
                  return (
                    <Box key={dog.id} sx={{ mt: dogIdx === 0 ? 1.5 : 2, pt: dogIdx > 0 ? 2 : 0, borderTop: dogIdx > 0 ? '1px solid' : undefined, borderColor: 'divider' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        {dog.name}
                        {(dog.breed || dog.age != null) && (
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 400 }}>
                            {[dog.breed, dog.age != null ? `${dog.age}세` : null].filter(Boolean).join(' · ')}
                          </Typography>
                        )}
                      </Typography>
                      {paths.length > 0 && (
                        <Box sx={{ mb: intro ? 1.5 : 0 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            강아지 사진
                          </Typography>
                          {dogPhotosLoading ? (
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              {paths.map((_, i) => (
                                <Skeleton key={i} variant="rectangular" width={80} height={80} sx={{ borderRadius: 2 }} />
                              ))}
                            </Box>
                          ) : (
                            <ImageList cols={4} gap={8} sx={{ m: 0 }}>
                              {urls.map((url, idx) => (
                                <ImageListItem key={`${dog.id}-${idx}`}>
                                  <img
                                    src={url}
                                    alt={`${dog.name}-${idx}`}
                                    style={{ borderRadius: 8, width: '100%', aspectRatio: '1', objectFit: 'cover' }}
                                  />
                                </ImageListItem>
                              ))}
                            </ImageList>
                          )}
                        </Box>
                      )}
                      {intro ? (
                        <Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                            강아지 소개
                          </Typography>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {intro}
                          </Typography>
                        </Box>
                      ) : (
                        paths.length === 0 && (
                          <Typography variant="body2" color="text.secondary">
                            등록된 강아지 사진·소개가 없습니다.
                          </Typography>
                        )
                      )}
                    </Box>
                  );
                })}
            </Box>

            <Divider />

            {/* 기본 정보 */}
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom sx={{ fontWeight: 600, display: 'block' }}>
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
              <Typography variant="caption" color="text.secondary" gutterBottom sx={{ fontWeight: 600, display: 'block' }}>
                라이프스타일
              </Typography>
              <Stack spacing={0.75}>
                <InfoRow label="흡연" value={user.smoking} />
                <InfoRow label="음주" value={user.drinking} />
                <InfoRow label="종교" value={user.religion} />
                <InfoRow label="직업" value={user.job} />
                <InfoRow label="학력" value={user.education} />
                {user.interests && user.interests.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>관심사</Typography>
                    {user.interests.map((v) => <Chip key={v} label={v} size="small" />)}
                  </Box>
                )}
              </Stack>
            </Box>

            <Divider />

            {/* 계정 정보 */}
            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom sx={{ fontWeight: 600, display: 'block' }}>
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
                <InfoRow label="캔디 잔액" value={user.cookie_balance != null ? `${user.cookie_balance}개` : undefined} />
                <InfoRow label="가입일" value={dayjs(user.created_at).format('YYYY-MM-DD HH:mm')} />
                <InfoRow label="ID" value={user.id} mono />
              </Stack>
            </Box>

            {user.bio && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" gutterBottom sx={{ fontWeight: 600, display: 'block' }}>
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
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <ReportIcon sx={{ color: 'error.main', fontSize: 28 }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          신고 내역
        </Typography>
        <Chip label={`총 ${reports.length}건`} size="small" color="error" variant="outlined" />
      </Box>

      {/* 검색 */}
      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="신고 사유, 유저 ID 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
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
