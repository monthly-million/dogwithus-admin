import { useState, useMemo, useEffect, useCallback } from 'react';
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
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Fade,
  Popover,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SaveIcon from '@mui/icons-material/Save';
import FavoriteIcon from '@mui/icons-material/Favorite';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseAdmin } from '../api/supabaseClient';
import type { User, BlockedContact } from '../types/database';
import dayjs from 'dayjs';

const PHOTO_BUCKET = 'profile-photos';

type ApprovalStatus = 'approved' | 'pending' | 'rejected';

type MatchField = 'nickname' | 'gender' | 'regions' | 'age' | 'smoking' | 'drinking' | 'religion' | 'height' | 'bio';

const MATCH_COLUMNS: { key: MatchField; label: string; highlightable: boolean; minWidth: number }[] = [
  { key: 'nickname', label: '닉네임', highlightable: false, minWidth: 90 },
  { key: 'gender', label: '성별', highlightable: false, minWidth: 70 },
  { key: 'regions', label: '지역', highlightable: true, minWidth: 120 },
  { key: 'age', label: '나이', highlightable: true, minWidth: 60 },
  { key: 'smoking', label: '흡연', highlightable: true, minWidth: 80 },
  { key: 'drinking', label: '음주', highlightable: true, minWidth: 80 },
  { key: 'religion', label: '종교', highlightable: true, minWidth: 80 },
  { key: 'height', label: '키', highlightable: false, minWidth: 60 },
  { key: 'bio', label: '자기소개', highlightable: false, minWidth: 180 },
];

const MATCH_BG = '#e8f5e9';

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string; color: 'success' | 'warning' | 'error' }[] = [
  { value: 'approved', label: '승인', color: 'success' },
  { value: 'pending', label: '대기', color: 'warning' },
  { value: 'rejected', label: '거절', color: 'error' },
];

// ─── API functions ────────────────────────────────────────────────────────────

async function fetchUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as User[];
}

async function updateApprovalStatus(userId: string, status: ApprovalStatus, rejectedReason?: string) {
  const payload: Record<string, unknown> = { approval_status: status };
  if (status === 'rejected' && rejectedReason !== undefined) {
    payload.rejected_reason = rejectedReason;
  }
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(payload)
    .eq('id', userId);
  if (error) throw new Error(error.message ?? JSON.stringify(error));
}

/** receiver에게 이미 소개된 카드 프로필 ID (intros, 모든 status — 유니크 제약과 동일하게 중복 소개 방지) */
async function fetchIntroCardIdsForReceiver(receiverId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('intros')
    .select('card_profile_id')
    .eq('receiver_id', receiverId);
  if (error) throw error;
  return (data ?? []).map((row: { card_profile_id: string }) => row.card_profile_id);
}

async function updateSuspension(
  userId: string,
  payload: { suspended_at: string | null; suspended_until: string | null; suspended_reason: string | null },
) {
  const { error } = await supabaseAdmin.from('profiles').update(payload).eq('id', userId);
  if (error) throw new Error(error.message ?? JSON.stringify(error));
}

async function createAdminManualIntros(receiverId: string, cardProfileIds: string[]) {
  const inserts = cardProfileIds.map((card_profile_id) => ({
    receiver_id: receiverId,
    card_profile_id,
    source: 'admin_manual' as const,
  }));
  const { error } = await supabaseAdmin.from('intros').insert(inserts);
  if (error) throw error;
}

/** 비교용: 국내 0으로 시작하는 숫자열로 통일 (82… → 0…) */
function phoneMatchKey(phone?: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 10) return `0${d.slice(2)}`;
  return d;
}

/** DB·입력 형식 차이를 고려해 blocked_contacts.phone 조회에 쓸 후보 문자열 */
function phoneKeyVariants(phone?: string): string[] {
  if (!phone?.trim()) return [];
  const t = phone.trim();
  const digits = t.replace(/\D/g, '');
  const variants = new Set<string>([t]);
  if (digits) variants.add(digits);
  const local0 = phoneMatchKey(phone);
  if (local0) {
    variants.add(local0);
    if (local0.startsWith('0') && local0.length === 11) {
      variants.add(`${local0.slice(0, 3)}-${local0.slice(3, 7)}-${local0.slice(7)}`);
    }
  }
  return [...variants].filter(Boolean);
}

/**
 * userA가 차단한 전화번호 목록과 userA의 전화번호를 차단한 유저 ID 목록을 반환합니다.
 * - blockedPhones: userA(owner_id)가 등록한 차단 번호 → 해당 번호를 가진 유저 제외
 * - blockedByOwnerIds: userA의 전화번호를 등록한 owner_id → 해당 유저 제외
 *
 * 관리자 화면에서 임의 유저 A 기준이므로 service 클라이언트로 조회합니다(RLS 우회).
 */
async function fetchBlockedContactsForMatch(
  userId: string,
  userPhone?: string,
): Promise<{ blockedPhones: string[]; blockedByOwnerIds: string[] }> {
  const phoneVariants = phoneKeyVariants(userPhone);

  const [byMeResult, byOthersResult] = await Promise.all([
    supabaseAdmin
      .from('blocked_contacts')
      .select('phone')
      .eq('owner_id', userId),
    phoneVariants.length > 0
      ? supabaseAdmin.from('blocked_contacts').select('owner_id').in('phone', phoneVariants)
      : Promise.resolve({ data: [] as Pick<BlockedContact, 'owner_id'>[], error: null }),
  ]);

  if (byMeResult.error) throw byMeResult.error;
  if (byOthersResult.error) throw byOthersResult.error;

  const blockedPhones = (byMeResult.data ?? []).map((r) => (r as Pick<BlockedContact, 'phone'>).phone);
  const blockedByOwnerIds = (byOthersResult.data ?? []).map(
    (r) => (r as Pick<BlockedContact, 'owner_id'>).owner_id,
  );

  return { blockedPhones, blockedByOwnerIds };
}

// ─── Photo helpers ────────────────────────────────────────────────────────────

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

// ─── Sorting utilities ────────────────────────────────────────────────────────

/**
 * 지역 근접 점수: regions 배열에서 겹치는 항목 수를 반환합니다.
 * 실제 좌표 데이터가 없으므로 공통 지역 문자열이 많을수록 가까운 것으로 간주합니다.
 * (향후 좌표 기반 Haversine 거리로 교체 가능)
 */
function getRegionOverlapScore(userA: User, candidate: User): number {
  const aRegions = userA.regions ?? [];
  const cRegions = candidate.regions ?? [];
  return aRegions.filter((r) => cRegions.includes(r)).length;
}

function getArrayOverlapScore(aArr?: string[], bArr?: string[]): number {
  if (!aArr || !bArr) return 0;
  return aArr.filter((item) => bArr.includes(item)).length;
}

function sortCandidates(userA: User, candidates: User[]): User[] {
  return [...candidates].sort((a, b) => {
    // 1. 지역 근접 (겹치는 지역 문자열 수 기반, 많을수록 가까움)
    const regionA = getRegionOverlapScore(userA, a);
    const regionB = getRegionOverlapScore(userA, b);
    if (regionB !== regionA) return regionB - regionA;

    // 2. 나이 차이 (작을수록 우선)
    const ageDiffA = Math.abs((userA.age ?? 0) - (a.age ?? 0));
    const ageDiffB = Math.abs((userA.age ?? 0) - (b.age ?? 0));
    if (ageDiffA !== ageDiffB) return ageDiffA - ageDiffB;

    // 3. 같은 종교 우선
    const relA = userA.religion === a.religion ? 1 : 0;
    const relB = userA.religion === b.religion ? 1 : 0;
    if (relB !== relA) return relB - relA;

    // 4. 관심사 겹치는 수 (많을수록 우선)
    const intA = getArrayOverlapScore(userA.interests, a.interests);
    const intB = getArrayOverlapScore(userA.interests, b.interests);
    if (intB !== intA) return intB - intA;

    // 5. 흡연/음주 일치 수 (많을수록 우선)
    const lifeA = (userA.smoking === a.smoking ? 1 : 0) + (userA.drinking === a.drinking ? 1 : 0);
    const lifeB = (userA.smoking === b.smoking ? 1 : 0) + (userA.drinking === b.drinking ? 1 : 0);
    return lifeB - lifeA;
  });
}

/**
 * 나이 차이에 따라 초록색 농도를 반환합니다.
 * 0-2살: 진한 초록 / 3-4살: 연한 초록 / 5-6살: 더 연한 초록 / 7살: 아주 연한 초록 / 8살+: 흰색(undefined)
 */
function getAgeBgColor(aAge?: number, bAge?: number): string | undefined {
  if (aAge == null || bAge == null) return undefined;
  const diff = Math.abs(aAge - bAge);
  if (diff <= 2) return '#e8f5e9';
  if (diff <= 4) return '#eef7ee';
  if (diff <= 6) return '#f3faf3';
  if (diff <= 7) return '#f8fcf8';
  return undefined;
}

function isSameField(aVal: unknown, bVal: unknown): boolean {
  if (!aVal || !bVal) return false;
  if (Array.isArray(aVal) && Array.isArray(bVal)) {
    return (aVal as string[]).some((v) => (bVal as string[]).includes(v));
  }
  return aVal === bVal;
}

function formatFieldValue(user: User, field: MatchField): string {
  const val = user[field];
  if (val === undefined || val === null || val === '') return '-';
  if (Array.isArray(val)) return (val as string[]).join(', ') || '-';
  if (field === 'height') return `${val}cm`;
  return String(val);
}

function ArrayCell({ items, max = 2 }: { items?: string[]; max?: number }) {
  if (!items || items.length === 0) return <>-</>;
  const visible = items.slice(0, max);
  const rest = items.slice(max);
  const fullText = items.join(', ');
  return (
    <Tooltip title={rest.length > 0 ? fullText : ''} arrow placement="top">
      <span>
        {visible.join(', ')}
        {rest.length > 0 && (
          <span style={{ color: '#888', marginLeft: 2 }}>+{rest.length}...</span>
        )}
      </span>
    </Tooltip>
  );
}

// ─── PhotoLightbox (재사용 라이트박스) ─────────────────────────────────────────

interface PhotoLightboxProps {
  user: User | null;
  open: boolean;
  onClose: () => void;
  initialIndex?: number;
}

function PhotoLightbox({ user, open, onClose, initialIndex = 0 }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const photoPaths = user?.profile_photos ?? [];

  const { data: urls = [], isLoading } = useQuery({
    queryKey: ['lightbox-photos', user?.id, photoPaths],
    queryFn: () => fetchSignedPhotoUrls(photoPaths),
    enabled: open && photoPaths.length > 0,
    staleTime: 1000 * 60 * 50,
    retry: 1,
  });

  const total = urls.length;

  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total]);
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total]);

  useEffect(() => {
    if (!open) { setIndex(0); return; }
    setIndex(initialIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, prev, next, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: { sx: { bgcolor: 'transparent', boxShadow: 'none', overflow: 'visible', m: 0 } },
        backdrop: { sx: { bgcolor: 'rgba(0,0,0,0.92)' } },
      }}
    >
      <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>
        {/* 닫기 */}
        <IconButton
          onClick={onClose}
          sx={{
            position: 'fixed', top: 16, right: 16, zIndex: 10,
            bgcolor: 'rgba(255,255,255,0.15)', color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' },
          }}
        >
          <CloseIcon />
        </IconButton>

        {/* 닉네임 */}
        {user && (
          <Typography
            sx={{ position: 'fixed', top: 22, left: 24, color: 'white', fontWeight: 600, fontSize: 16, zIndex: 10 }}
          >
            {user.nickname}
          </Typography>
        )}

        {/* 이전 */}
        {total > 1 && (
          <IconButton
            onClick={prev}
            sx={{
              position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)',
              bgcolor: 'rgba(255,255,255,0.15)', color: 'white',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' },
            }}
          >
            <ArrowBackIosNewIcon />
          </IconButton>
        )}

        {/* 사진 본체 */}
        {isLoading ? (
          <CircularProgress sx={{ color: 'white' }} />
        ) : urls.length === 0 ? (
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>등록된 사진이 없습니다.</Typography>
        ) : (
          <Fade in={open} timeout={200} key={index}>
            <Box
              component="img"
              src={urls[index]}
              alt={`${user?.nickname ?? ''} 프로필 ${index + 1}`}
              sx={{
                maxWidth: '88vw',
                maxHeight: '88vh',
                objectFit: 'contain',
                borderRadius: 2,
                display: 'block',
                boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              }}
            />
          </Fade>
        )}

        {/* 다음 */}
        {total > 1 && (
          <IconButton
            onClick={next}
            sx={{
              position: 'fixed', right: 16, top: '50%', transform: 'translateY(-50%)',
              bgcolor: 'rgba(255,255,255,0.15)', color: 'white',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' },
            }}
          >
            <ArrowForwardIosIcon />
          </IconButton>
        )}

        {/* 인디케이터 점 */}
        {total > 1 && (
          <Box
            sx={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 1, alignItems: 'center',
            }}
          >
            {urls.map((_, i) => (
              <Box
                key={i}
                onClick={() => setIndex(i)}
                sx={{
                  width: i === index ? 20 : 8, height: 8, borderRadius: 4,
                  bgcolor: i === index ? 'white' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              />
            ))}
          </Box>
        )}

        {/* 번호 */}
        {total > 0 && (
          <Typography
            sx={{ position: 'fixed', bottom: 24, right: 24, color: 'rgba(255,255,255,0.7)', fontSize: 13 }}
          >
            {index + 1} / {total}
          </Typography>
        )}
      </Box>
    </Dialog>
  );
}

// ─── ManualMatchModal ─────────────────────────────────────────────────────────

interface ManualMatchModalProps {
  open: boolean;
  onClose: () => void;
  userA: User;
  allUsers: User[];
  approvalMode?: boolean;
  onApproveAfterMatch?: () => Promise<void>;
}

function ManualMatchModal({ open, onClose, userA, allUsers, approvalMode = false, onApproveAfterMatch }: ManualMatchModalProps) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [matchSuccess, setMatchSuccess] = useState(false);
  const [lightboxUser, setLightboxUser] = useState<User | null>(null);
  const [sortAnchorEl, setSortAnchorEl] = useState<HTMLElement | null>(null);

  const { data: existingIntroCardIds = [], isLoading: introsLoading } = useQuery({
    queryKey: ['intros-card-ids-for-receiver', userA.id],
    queryFn: () => fetchIntroCardIdsForReceiver(userA.id),
    enabled: open,
  });

  const { data: blockedContacts, isLoading: blockedLoading } = useQuery({
    queryKey: ['blocked-contacts-for-match', userA.id, userA.phone],
    queryFn: () => fetchBlockedContactsForMatch(userA.id, userA.phone),
    enabled: open,
  });

  const matchedIds = useMemo(() => new Set(existingIntroCardIds), [existingIntroCardIds]);

  const blockedIdsSet = useMemo(() => {
    if (!blockedContacts) return new Set<string>();
    const { blockedPhones, blockedByOwnerIds } = blockedContacts;
    const ids = new Set<string>(blockedByOwnerIds);
    const blockedKeys = new Set(blockedPhones.map((p) => phoneMatchKey(p)).filter(Boolean));
    // 내가 blocked_contacts에 넣은 번호를 프로필 전화번호로 쓰는 유저 제외 (형식 통일 후 비교)
    allUsers.forEach((u) => {
      const key = phoneMatchKey(u.phone);
      if (key && blockedKeys.has(key)) ids.add(u.id);
    });
    return ids;
  }, [blockedContacts, allUsers]);

  const candidates = useMemo(() => {
    if (introsLoading || blockedLoading) return [];
    const filtered = allUsers.filter((u) => {
      if (u.id === userA.id) return false;
      if (u.approval_status !== 'approved') return false;
      if (matchedIds.has(u.id)) return false;
      if (blockedIdsSet.has(u.id)) return false;
      // 이성만 표시 (성별 정보가 있는 경우에만 필터링)
      if (userA.gender && u.gender && u.gender === userA.gender) return false;
      return true;
    });
    return sortCandidates(userA, filtered);
  }, [allUsers, userA, matchedIds, blockedIdsSet, introsLoading, blockedLoading]);

  // 유저 A 첫 번째 사진 signed URL
  const userAFirstPhoto = userA.profile_photos?.[0];
  const { data: userAPhotoUrl } = useQuery({
    queryKey: ['single-photo', userAFirstPhoto],
    queryFn: async () => {
      if (!userAFirstPhoto) return null;
      const path = extractStoragePath(userAFirstPhoto);
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: Boolean(userAFirstPhoto) && open,
    staleTime: 1000 * 60 * 50,
  });

  // 후보자들 첫 번째 사진 batch signed URLs
  const firstPhotoPaths = useMemo(
    () => candidates.map((c) => c.profile_photos?.[0]).filter(Boolean) as string[],
    [candidates]
  );

  const { data: candidatePhotoMap = {} } = useQuery({
    queryKey: ['candidate-photos', firstPhotoPaths.slice().sort().join(',')],
    queryFn: async () => {
      if (firstPhotoPaths.length === 0) return {};
      const paths = firstPhotoPaths.map(extractStoragePath);
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, 3600);
      if (error || !data) return {};
      const map: Record<string, string> = {};
      firstPhotoPaths.forEach((originalPath, idx) => {
        if (data[idx]?.signedUrl) map[originalPath] = data[idx].signedUrl;
      });
      return map;
    },
    enabled: open && firstPhotoPaths.length > 0,
    staleTime: 1000 * 60 * 50,
  });

  const handleRowClick = (userId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(userId)) return prev.filter((id) => id !== userId);
      if (prev.length >= 2) return prev;
      return [...prev, userId];
    });
  };

  const handleMatch = async () => {
    if (selectedIds.length === 0 || matching) return;
    setMatching(true);
    setMatchError('');
    setMatchSuccess(false);
    try {
      await createAdminManualIntros(userA.id, selectedIds);
      await queryClient.invalidateQueries({ queryKey: ['intros-card-ids-for-receiver', userA.id] });
      if (approvalMode && onApproveAfterMatch) {
        await onApproveAfterMatch();
        handleClose();
        return;
      }
      setMatchSuccess(true);
      setSelectedIds([]);
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : '매칭에 실패했습니다.');
    } finally {
      setMatching(false);
    }
  };

  const handleClose = () => {
    setSelectedIds([]);
    setMatchError('');
    setMatchSuccess(false);
    onClose();
  };

  const getCellBg = (field: MatchField, candidate: User): string | undefined => {
    // 나이: 차이에 따른 그라데이션 초록
    if (field === 'age') return getAgeBgColor(userA.age, candidate.age);
    // 지역: 겹치는 항목이 하나라도 있으면 초록
    if (field === 'regions') {
      const overlap = getArrayOverlapScore(userA.regions, candidate.regions);
      return overlap > 0 ? MATCH_BG : undefined;
    }
    const col = MATCH_COLUMNS.find((c) => c.key === field);
    if (!col?.highlightable) return undefined;
    return isSameField(userA[field], candidate[field]) ? MATCH_BG : undefined;
  };

  // thead 첫 번째 행(컬럼 헤더)의 높이 – MUI small table 기준 약 37px
  const HEADER_ROW_H = 37;

  const userARowSx = {
    position: 'sticky' as const,
    top: HEADER_ROW_H,
    zIndex: 3,
    bgcolor: '#e3f2fd',
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth>
      <DialogTitle
        sx={{
          fontWeight: 700,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          수동 매칭
          <Tooltip title="정렬기준 안내" placement="right">
            <IconButton
              size="small"
              onClick={(e) => setSortAnchorEl(e.currentTarget)}
              sx={{ p: 0.3, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {matchSuccess && (
          <Alert severity="success" sx={{ mx: 2, mt: 2 }}>
            매칭이 완료되었습니다.
          </Alert>
        )}
        {matchError && (
          <Alert severity="error" sx={{ mx: 2, mt: 2 }}>
            {matchError}
          </Alert>
        )}

        <Popover
          open={Boolean(sortAnchorEl)}
          anchorEl={sortAnchorEl}
          onClose={() => setSortAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { mt: 0.5, borderRadius: 2, boxShadow: 3, maxWidth: 340 } } }}
        >
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              후보 리스팅 정렬 기준
            </Typography>
            <Typography variant="caption" color="text.secondary">
              아래 우선순위 순서대로 정렬됩니다.
            </Typography>
          </Box>
          <List dense disablePadding sx={{ px: 1, pb: 1.5 }}>
            {[
              {
                num: '1',
                primary: '이미 소개된 카드 제외',
                secondary:
                  'intros 테이블에서 해당 수신자(receiver)에게 이미 소개된 카드 프로필은 목록에서 제외됩니다.',
                color: '#e53935',
              },
              {
                num: '2',
                primary: '차단 연락처 제외',
                secondary:
                  'blocked_contacts 테이블 기준으로, 유저 A가 차단한 번호의 유저 또는 유저 A의 번호를 차단한 유저는 목록에서 제외됩니다.',
                color: '#8e24aa',
              },
              {
                num: '3',
                primary: '지역 가까운 순',
                secondary: 'regions 배열에서 겹치는 지역 문자열이 많을수록 앞에 표시됩니다. (실제 좌표 기반이 아닌 지역명 일치 기반)',
                color: '#1e88e5',
              },
              {
                num: '4',
                primary: '나이 차이 적은 순',
                secondary: '나이 차이가 적을수록 앞에 표시됩니다. 차이가 적을수록 초록색 배경이 진해집니다.',
                color: '#43a047',
              },
              {
                num: '5',
                primary: '같은 종교 우선',
                secondary: '유저 A와 종교가 같은 사람이 앞에 표시됩니다.',
                color: '#fb8c00',
              },
              {
                num: '6',
                primary: '흡연·음주 일치 순',
                secondary: '흡연 여부와 음주 여부가 같을수록 앞에 표시됩니다. (최대 2점)',
                color: '#00897b',
              },
            ].map((item) => (
              <ListItem key={item.primary} alignItems="flex-start" sx={{ py: 0.5, px: 1 }}>
                <ListItemIcon sx={{ minWidth: 28, mt: 0.3 }}>
                  <Box
                    sx={{
                      width: 20, height: 20, borderRadius: '50%',
                      bgcolor: item.color, color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}
                  >
                    {item.num}
                  </Box>
                </ListItemIcon>
                <ListItemText
                  primary={<Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{item.primary}</Typography>}
                  secondary={<Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>{item.secondary}</Typography>}
                />
              </ListItem>
            ))}
          </List>
        </Popover>

        <TableContainer component={Paper} sx={{ maxHeight: '65vh', overflow: 'auto', mt: 1 }} elevation={0}>
          <Table stickyHeader size="small">
            <TableHead>
              {/* ── 컬럼 헤더 행 ─────────────────────────────────── */}
              <TableRow>
                <TableCell
                  sx={{
                    bgcolor: 'grey.100',
                    fontWeight: 700,
                    minWidth: 56,
                    whiteSpace: 'nowrap',
                  }}
                >
                  프로필
                </TableCell>
                {MATCH_COLUMNS.map((col) => (
                  <TableCell
                    key={col.key}
                    sx={{
                      bgcolor: 'grey.100',
                      fontWeight: 700,
                      minWidth: col.minWidth,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>

              {/* ── 유저 A 고정 행 ────────────────────────────────── */}
              <TableRow>
                <TableCell sx={userARowSx}>
                  <Tooltip title="사진 전체 보기">
                    <Avatar
                      src={userAPhotoUrl ?? undefined}
                      onClick={(e) => { e.stopPropagation(); setLightboxUser(userA); }}
                      sx={{
                        width: 40, height: 40, fontSize: 16,
                        cursor: 'pointer',
                        outline: '2px solid transparent',
                        transition: 'outline 0.15s, transform 0.15s',
                        '&:hover': { outline: '2px solid #1976d2', transform: 'scale(1.08)' },
                      }}
                    >
                      {userA.nickname?.[0] ?? '?'}
                    </Avatar>
                  </Tooltip>
                </TableCell>
                {MATCH_COLUMNS.map((col) => (
                  <TableCell
                    key={col.key}
                    sx={{
                      ...userARowSx,
                      fontWeight: 600,
                      maxWidth: col.key === 'bio' ? 220 : undefined,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: col.key === 'bio' ? 'normal' : 'nowrap',
                    }}
                  >
                    {col.key === 'regions'
                      ? <ArrayCell items={userA.regions} />
                      : formatFieldValue(userA, col.key)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {introsLoading ? (
                <TableRow>
                  <TableCell colSpan={MATCH_COLUMNS.length + 1} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={MATCH_COLUMNS.length + 1} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      매칭 가능한 유저가 없습니다.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate) => {
                  const isSelected = selectedIds.includes(candidate.id);
                  const firstPhoto = candidate.profile_photos?.[0];
                  const photoUrl = firstPhoto ? candidatePhotoMap[firstPhoto] : undefined;

                  return (
                    <TableRow
                      key={candidate.id}
                      onClick={() => handleRowClick(candidate.id)}
                      sx={{
                        cursor: 'pointer',
                        outline: isSelected ? '2px solid #1976d2' : 'none',
                        outlineOffset: '-2px',
                        bgcolor: isSelected ? 'rgba(25, 118, 210, 0.08)' : 'inherit',
                        '&:hover': {
                          bgcolor: isSelected
                            ? 'rgba(25, 118, 210, 0.14)'
                            : 'action.hover',
                        },
                      }}
                    >
                      <TableCell>
                        <Tooltip title="사진 전체 보기">
                          <Avatar
                            src={photoUrl}
                            onClick={(e) => { e.stopPropagation(); setLightboxUser(candidate); }}
                            sx={{
                              width: 36, height: 36, fontSize: 14,
                              cursor: 'pointer',
                              outline: '2px solid transparent',
                              transition: 'outline 0.15s, transform 0.15s',
                              '&:hover': { outline: '2px solid #1976d2', transform: 'scale(1.08)' },
                            }}
                          >
                            {candidate.nickname?.[0] ?? '?'}
                          </Avatar>
                        </Tooltip>
                      </TableCell>
                      {MATCH_COLUMNS.map((col) => (
                        <TableCell
                          key={col.key}
                          sx={{
                            bgcolor: getCellBg(col.key, candidate),
                            maxWidth: col.key === 'bio' ? 220 : undefined,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: col.key === 'bio' ? 'normal' : 'nowrap',
                          }}
                        >
                          {col.key === 'regions'
                            ? <ArrayCell items={candidate.regions} />
                            : formatFieldValue(candidate, col.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      {/* 사진 라이트박스 */}
      <PhotoLightbox
        user={lightboxUser}
        open={Boolean(lightboxUser)}
        onClose={() => setLightboxUser(null)}
      />

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography
          variant="body2"
          color={approvalMode && selectedIds.length === 0 ? 'warning.main' : 'text.secondary'}
        >
          {approvalMode
            ? selectedIds.length === 0
              ? '승인을 위해 최소 1명 이상 선택해 주세요 (최대 2명)'
              : `${selectedIds.length}명 선택됨 · 매칭 후 승인됩니다 (최대 2명)`
            : selectedIds.length > 0
              ? `${selectedIds.length}명 선택됨 (최대 2명)`
              : '매칭할 사람의 행을 클릭하여 선택하세요 (최대 2명)'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={handleClose} variant="outlined" color="inherit">
            취소
          </Button>
          <Button
            onClick={handleMatch}
            variant="contained"
            color={approvalMode ? 'success' : 'primary'}
            disabled={selectedIds.length === 0 || matching}
            startIcon={
              matching ? <CircularProgress size={14} color="inherit" /> : <FavoriteIcon />
            }
          >
            {approvalMode ? '매칭 후 승인' : '매칭하기'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

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
  { field: 'cookie_balance', headerName: '쿠키', width: 80, type: 'number' },
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
  {
    field: 'suspended_until',
    headerName: '정지 종료일',
    width: 160,
    renderCell: (p) => {
      if (!p.value) return '-';
      const isActive = dayjs(p.value as string).isAfter(dayjs());
      return (
        <Chip
          label={dayjs(p.value as string).format('YYYY-MM-DD HH:mm')}
          size="small"
          color={isActive ? 'error' : 'default'}
        />
      );
    },
  },
  {
    field: 'deleted_at',
    headerName: '탈퇴일',
    width: 160,
    renderCell: (p) => (p.value ? dayjs(p.value as string).format('YYYY-MM-DD HH:mm') : '-'),
  },
];

// ─── UsersPage ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editStatus, setEditStatus] = useState<ApprovalStatus | ''>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchModalApprovalMode, setMatchModalApprovalMode] = useState(false);
  const [lightboxUser, setLightboxUser] = useState<User | null>(null);
  const [lightboxInitialIndex, setLightboxInitialIndex] = useState(0);

  // 거절 사유 다이얼로그
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // 정지 관리
  const [editSuspendedUntil, setEditSuspendedUntil] = useState('');
  const [editSuspendedReason, setEditSuspendedReason] = useState('');
  const [suspending, setSuspending] = useState(false);
  const [suspendError, setSuspendError] = useState('');
  const [suspendSuccess, setSuspendSuccess] = useState(false);

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

  const openLightbox = (idx: number) => {
    setLightboxInitialIndex(idx);
    setLightboxUser(selectedUser);
  };

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
    setEditSuspendedUntil(
      user.suspended_until ? dayjs(user.suspended_until).format('YYYY-MM-DDTHH:mm') : '',
    );
    setEditSuspendedReason(user.suspended_reason ?? '');
    setSuspendError('');
    setSuspendSuccess(false);
  };

  const handleCloseDrawer = () => {
    setSelectedUser(null);
    setEditStatus('');
    setSaveError('');
    setSaveSuccess(false);
    setMatchModalOpen(false);
    setEditSuspendedUntil('');
    setEditSuspendedReason('');
    setSuspendError('');
    setSuspendSuccess(false);
  };

  const isStatusChanged = editStatus !== '' && editStatus !== selectedUser?.approval_status;

  const isSuspended = Boolean(
    selectedUser?.suspended_until && dayjs(selectedUser.suspended_until).isAfter(dayjs()),
  );

  const handleApplySuspension = async () => {
    if (!selectedUser || !editSuspendedUntil) return;
    setSuspending(true);
    setSuspendError('');
    setSuspendSuccess(false);
    try {
      const now = new Date().toISOString();
      const payload = {
        suspended_at: selectedUser.suspended_at ?? now,
        suspended_until: new Date(editSuspendedUntil).toISOString(),
        suspended_reason: editSuspendedReason.trim() || null,
      };
      await updateSuspension(selectedUser.id, payload);
      const updated = {
        ...selectedUser,
        ...payload,
        suspended_reason: editSuspendedReason.trim() || undefined,
      };
      setSelectedUser(updated);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuspendSuccess(true);
    } catch (err) {
      setSuspendError(err instanceof Error ? err.message : '정지 처리에 실패했습니다.');
    } finally {
      setSuspending(false);
    }
  };

  const handleLiftSuspension = async () => {
    if (!selectedUser) return;
    setSuspending(true);
    setSuspendError('');
    setSuspendSuccess(false);
    try {
      const payload = { suspended_at: null, suspended_until: null, suspended_reason: null };
      await updateSuspension(selectedUser.id, payload);
      const updated = {
        ...selectedUser,
        suspended_at: undefined,
        suspended_until: undefined,
        suspended_reason: undefined,
      };
      setSelectedUser(updated);
      setEditSuspendedUntil('');
      setEditSuspendedReason('');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setSuspendSuccess(true);
    } catch (err) {
      setSuspendError(err instanceof Error ? err.message : '정지 해제에 실패했습니다.');
    } finally {
      setSuspending(false);
    }
  };

  const handleSaveClick = () => {
    if (!isStatusChanged) return;
    if (editStatus === 'approved') {
      // 수동 매칭 모달을 승인 모드로 열기
      setMatchModalApprovalMode(true);
      setMatchModalOpen(true);
    } else if (editStatus === 'rejected') {
      // 거절 사유 입력 다이얼로그 열기
      setRejectReason('');
      setRejectError('');
      setRejectDialogOpen(true);
    } else {
      setConfirmOpen(true);
    }
  };

  const handleConfirm = async () => {
    if (!selectedUser || !editStatus) return;
    setConfirmOpen(false);
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      await updateApprovalStatus(selectedUser.id, editStatus as ApprovalStatus);
      setSelectedUser({ ...selectedUser, approval_status: editStatus });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 수동 매칭 완료 후 승인 처리 (approvalMode)
  const handleApproveAfterMatch = async () => {
    if (!selectedUser) return;
    await updateApprovalStatus(selectedUser.id, 'approved');
    setSelectedUser({ ...selectedUser, approval_status: 'approved' });
    setEditStatus('approved');
    await queryClient.invalidateQueries({ queryKey: ['users'] });
    setSaveSuccess(true);
  };

  // 거절 사유 확인 처리
  const handleRejectConfirm = async () => {
    if (!selectedUser || !rejectReason.trim()) return;
    setRejectLoading(true);
    setRejectError('');
    try {
      await updateApprovalStatus(selectedUser.id, 'rejected', rejectReason.trim());
      setSelectedUser({ ...selectedUser, approval_status: 'rejected', rejected_reason: rejectReason.trim() });
      setEditStatus('rejected');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setRejectDialogOpen(false);
      setSaveSuccess(true);
    } catch (err) {
      setRejectError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setRejectLoading(false);
    }
  };

  const detailRows: [string, string | number | boolean | undefined][] = selectedUser
    ? [
        ['ID', selectedUser.id],
        ['디바이스 ID', selectedUser.device_id],
        ['닉네임', selectedUser.nickname],
        ['전화번호', selectedUser.phone],
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
        ['쿠키 잔액', selectedUser.cookie_balance?.toLocaleString()],
        ['FCM 토큰', selectedUser.fcm_token],
        ['테스트 데이터', selectedUser.is_test_data ? '예' : '아니오'],
        ['관리자', selectedUser.is_admin ? '예' : '아니오'],
        ['알림 허용', selectedUser.notifications_enabled === false ? '꺼짐' : '켜짐'],
        ['시그널 알림', selectedUser.notify_signals === false ? '꺼짐' : '켜짐'],
        ['메시지 알림', selectedUser.notify_messages === false ? '꺼짐' : '켜짐'],
        ['매칭 알림', selectedUser.notify_matches === false ? '꺼짐' : '켜짐'],
        ['공지 알림', selectedUser.notify_announcements === false ? '꺼짐' : '켜짐'],
        ['가입일', dayjs(selectedUser.created_at).format('YYYY-MM-DD HH:mm:ss')],
        ['수정일', selectedUser.updated_at ? dayjs(selectedUser.updated_at).format('YYYY-MM-DD HH:mm:ss') : '-'],
        ['탈퇴일', selectedUser.deleted_at ? dayjs(selectedUser.deleted_at).format('YYYY-MM-DD HH:mm:ss') : '-'],
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
            {/* 수동 매칭 버튼 */}
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              startIcon={<FavoriteIcon />}
              onClick={() => setMatchModalOpen(true)}
              sx={{ fontWeight: 600 }}
            >
              수동 매칭
            </Button>

            <Divider />

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
                    <ImageListItem
                      key={idx}
                      sx={{
                        borderRadius: 2,
                        overflow: 'hidden',
                        position: 'relative',
                        cursor: 'pointer',
                        '&:hover .photo-overlay': { opacity: 1 },
                      }}
                      onClick={() => openLightbox(idx)}
                    >
                      <img
                        src={url}
                        alt={`프로필 ${idx + 1}`}
                        loading="lazy"
                        style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      {/* 호버 오버레이 */}
                      <Box
                        className="photo-overlay"
                        sx={{
                          position: 'absolute', inset: 0,
                          bgcolor: 'rgba(0,0,0,0.35)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: 0, transition: 'opacity 0.15s',
                        }}
                      >
                        <ZoomInIcon sx={{ color: 'white', fontSize: 28 }} />
                      </Box>
                      <Tooltip title="새 탭에서 열기">
                        <IconButton
                          size="small"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          component="a"
                          onClick={(e) => e.stopPropagation()}
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

            {/* 정지 관리 */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  정지 관리
                </Typography>
                {isSuspended && (
                  <Chip
                    label="정지 중"
                    size="small"
                    color="error"
                    icon={<BlockIcon />}
                    sx={{ fontSize: 11, height: 20 }}
                  />
                )}
              </Box>

              {isSuspended && (
                <Alert severity="warning" sx={{ mb: 1.5, fontSize: 12, py: 0.5 }}>
                  <strong>{dayjs(selectedUser?.suspended_until).format('YYYY-MM-DD HH:mm')}</strong> 까지 정지
                  {selectedUser?.suspended_reason && (
                    <> · {selectedUser.suspended_reason}</>
                  )}
                </Alert>
              )}

              <TextField
                label="정지 종료일시"
                type="datetime-local"
                value={editSuspendedUntil}
                onChange={(e) => {
                  setEditSuspendedUntil(e.target.value);
                  setSuspendSuccess(false);
                  setSuspendError('');
                }}
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                slotProps={{ inputLabel: { shrink: true } }}
                disabled={suspending}
              />
              <TextField
                label="정지 사유"
                multiline
                minRows={2}
                maxRows={4}
                value={editSuspendedReason}
                onChange={(e) => {
                  setEditSuspendedReason(e.target.value);
                  setSuspendSuccess(false);
                  setSuspendError('');
                }}
                size="small"
                fullWidth
                placeholder="정지 사유를 입력하세요..."
                sx={{ mb: 1 }}
                disabled={suspending}
              />

              {suspendError && (
                <Alert severity="error" sx={{ mb: 1 }}>{suspendError}</Alert>
              )}
              {suspendSuccess && (
                <Alert severity="success" sx={{ mb: 1 }}>정지 정보가 업데이트되었습니다.</Alert>
              )}

              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  color="warning"
                  size="small"
                  fullWidth
                  startIcon={
                    suspending ? <CircularProgress size={14} color="inherit" /> : <BlockIcon />
                  }
                  onClick={handleApplySuspension}
                  disabled={!editSuspendedUntil || suspending}
                >
                  정지 적용
                </Button>
                {isSuspended && (
                  <Button
                    variant="outlined"
                    color="inherit"
                    size="small"
                    fullWidth
                    startIcon={
                      suspending ? <CircularProgress size={14} color="inherit" /> : <LockOpenIcon />
                    }
                    onClick={handleLiftSuspension}
                    disabled={suspending}
                  >
                    정지 해제
                  </Button>
                )}
              </Box>
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

      {/* 수동 매칭 모달 */}
      {selectedUser && (
        <ManualMatchModal
          open={matchModalOpen}
          onClose={() => {
            setMatchModalOpen(false);
            setMatchModalApprovalMode(false);
          }}
          userA={selectedUser}
          allUsers={data}
          approvalMode={matchModalApprovalMode}
          onApproveAfterMatch={handleApproveAfterMatch}
        />
      )}

      {/* 사진 라이트박스 */}
      <PhotoLightbox
        user={lightboxUser}
        open={Boolean(lightboxUser)}
        onClose={() => setLightboxUser(null)}
        initialIndex={lightboxInitialIndex}
      />

      {/* 승인 상태 변경 확인 Dialog */}
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

      {/* 거절 사유 입력 Dialog */}
      <Dialog
        open={rejectDialogOpen}
        onClose={() => !rejectLoading && setRejectDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 600 }}>거절 사유 입력</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            <strong>{selectedUser?.nickname}</strong> 님을 거절합니다.
            거절 사유를 입력해주세요.
          </DialogContentText>
          <TextField
            autoFocus
            label="거절 사유"
            multiline
            minRows={3}
            maxRows={6}
            fullWidth
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="거절 사유를 입력하세요..."
            disabled={rejectLoading}
          />
          {rejectError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {rejectError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setRejectDialogOpen(false)}
            variant="outlined"
            color="inherit"
            disabled={rejectLoading}
          >
            취소
          </Button>
          <Button
            onClick={handleRejectConfirm}
            variant="contained"
            color="error"
            disabled={!rejectReason.trim() || rejectLoading}
            startIcon={rejectLoading ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            거절 확인
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
