import { useState, useMemo } from 'react';
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
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Avatar,
  Tooltip,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import PersonIcon from '@mui/icons-material/Person';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseAdmin } from '../api/supabaseClient';
import type { Inquiry, InquiryCategory, InquiryStatus, User } from '../types/database';
import dayjs from 'dayjs';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<InquiryCategory, string> = {
  general: '일반',
  account: '계정',
  payment: '결제',
  bug: '버그',
  report: '신고',
  other: '기타',
};

const CATEGORY_COLORS: Record<InquiryCategory, 'default' | 'primary' | 'secondary' | 'warning' | 'error' | 'info' | 'success'> = {
  general: 'default',
  account: 'primary',
  payment: 'success',
  bug: 'error',
  report: 'warning',
  other: 'info',
};

const STATUS_LABELS: Record<InquiryStatus, string> = {
  open: '접수됨',
  in_progress: '처리중',
  answered: '답변완료',
  closed: '종료',
};

const STATUS_COLORS: Record<InquiryStatus, 'default' | 'primary' | 'secondary' | 'warning' | 'error' | 'info' | 'success'> = {
  open: 'warning',
  in_progress: 'info',
  answered: 'success',
  closed: 'default',
};

const STATUS_OPTIONS: InquiryStatus[] = ['open', 'in_progress', 'answered', 'closed'];

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchInquiries(): Promise<Inquiry[]> {
  const { data, error } = await supabaseAdmin
    .from('inquiries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Inquiry[];
}

async function fetchUserById(userId: string): Promise<User> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, email, profile_photos')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data as User;
}

async function updateInquiry(
  id: string,
  payload: { status: InquiryStatus; admin_reply: string | null },
): Promise<void> {
  const update: Record<string, unknown> = {
    status: payload.status,
    admin_reply: payload.admin_reply || null,
  };
  if (payload.admin_reply) {
    update.admin_replied_at = new Date().toISOString();
  }
  const { error } = await supabaseAdmin.from('inquiries').update(update).eq('id', id);
  if (error) throw error;
}

// ─── InquiryDetailDrawer ──────────────────────────────────────────────────────

interface InquiryDetailDrawerProps {
  inquiry: Inquiry | null;
  onClose: () => void;
}

function InquiryDetailDrawer({ inquiry, onClose }: InquiryDetailDrawerProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<InquiryStatus>(inquiry?.status ?? 'open');
  const [adminReply, setAdminReply] = useState<string>(inquiry?.admin_reply ?? '');
  const [dirty, setDirty] = useState(false);

  const isOpen = Boolean(inquiry);

  const { data: user } = useQuery({
    queryKey: ['user', inquiry?.user_id],
    queryFn: () => fetchUserById(inquiry!.user_id),
    enabled: Boolean(inquiry?.user_id),
  });

  const mutation = useMutation({
    mutationFn: (payload: { status: InquiryStatus; admin_reply: string | null }) =>
      updateInquiry(inquiry!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      setDirty(false);
    },
  });

  // inquiry가 바뀔 때마다 상태 초기화
  const prevId = inquiry?.id;
  if (inquiry && inquiry.id !== prevId) {
    setStatus(inquiry.status);
    setAdminReply(inquiry.admin_reply ?? '');
    setDirty(false);
  }

  const handleSave = () => {
    mutation.mutate({ status, admin_reply: adminReply || null });
  };

  // drawer open 시 초기화
  const handleDrawerEntered = () => {
    if (inquiry) {
      setStatus(inquiry.status);
      setAdminReply(inquiry.admin_reply ?? '');
      setDirty(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: { xs: '100%', sm: 520 }, p: 0 } },
        transition: { onEntered: handleDrawerEntered },
      }}
    >
      {inquiry && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* 헤더 */}
          <Box
            sx={{
              px: 3,
              py: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
              문의 상세
            </Typography>
            <Tooltip title="닫기">
              <IconButton onClick={onClose} size="small">
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {/* 본문 */}
          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
            {/* 작성자 */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
                <PersonIcon />
              </Avatar>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {user?.nickname ?? '알 수 없음'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.email ?? inquiry.user_id}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* 메타 정보 */}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }}>
              <Chip
                label={CATEGORY_LABELS[inquiry.category]}
                color={CATEGORY_COLORS[inquiry.category]}
                size="small"
              />
              <Chip
                label={STATUS_LABELS[inquiry.status]}
                color={STATUS_COLORS[inquiry.status]}
                size="small"
                variant="outlined"
              />
            </Stack>

            {/* 제목 */}
            <Typography variant="body2" color="text.secondary" gutterBottom>
              제목
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 600, mb: 2, wordBreak: 'break-word' }}
            >
              {inquiry.subject}
            </Typography>

            {/* 내용 */}
            <Typography variant="body2" color="text.secondary" gutterBottom>
              문의 내용
            </Typography>
            <Box
              sx={{
                bgcolor: 'grey.50',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                mb: 2,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <Typography variant="body2">{inquiry.body}</Typography>
            </Box>

            {/* 날짜 */}
            <Stack direction="row" spacing={3} sx={{ mb: 3 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  접수일시
                </Typography>
                <Typography variant="body2">
                  {dayjs(inquiry.created_at).format('YYYY.MM.DD HH:mm')}
                </Typography>
              </Box>
              {inquiry.admin_replied_at && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    답변일시
                  </Typography>
                  <Typography variant="body2">
                    {dayjs(inquiry.admin_replied_at).format('YYYY.MM.DD HH:mm')}
                  </Typography>
                </Box>
              )}
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* 관리자 처리 */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              관리자 처리
            </Typography>

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>상태 변경</InputLabel>
              <Select
                value={status}
                label="상태 변경"
                onChange={(e) => {
                  setStatus(e.target.value as InquiryStatus);
                  setDirty(true);
                }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Chip
                        label={STATUS_LABELS[s]}
                        color={STATUS_COLORS[s]}
                        size="small"
                        sx={{ pointerEvents: 'none' }}
                      />
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              multiline
              minRows={4}
              maxRows={10}
              label="관리자 답변"
              placeholder="사용자에게 전달할 답변을 입력하세요"
              value={adminReply}
              onChange={(e) => {
                setAdminReply(e.target.value);
                setDirty(true);
              }}
              size="small"
              sx={{ mb: 2 }}
            />

            {mutation.isError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                저장 중 오류가 발생했습니다.
              </Alert>
            )}
            {mutation.isSuccess && !dirty && (
              <Alert severity="success" sx={{ mb: 1 }}>
                저장되었습니다.
              </Alert>
            )}
          </Box>

          {/* 푸터 버튼 */}
          <Box
            sx={{
              px: 3,
              py: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 1,
            }}
          >
            <Button variant="outlined" onClick={onClose}>
              닫기
            </Button>
            <Button
              variant="contained"
              startIcon={
                mutation.isPending ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />
              }
              onClick={handleSave}
              disabled={mutation.isPending || !dirty}
            >
              저장
            </Button>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}

// ─── InquiriesPage ────────────────────────────────────────────────────────────

export default function InquiriesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<InquiryCategory | 'all'>('all');
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);

  const { data: inquiries = [], isLoading, error } = useQuery({
    queryKey: ['inquiries'],
    queryFn: fetchInquiries,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inquiries.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (q) {
        return (
          row.subject.toLowerCase().includes(q) ||
          row.body.toLowerCase().includes(q) ||
          row.user_id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [inquiries, search, statusFilter, categoryFilter]);

  const columns: GridColDef<Inquiry>[] = [
    {
      field: 'category',
      headerName: '카테고리',
      width: 110,
      renderCell: ({ value }) => (
        <Chip
          label={CATEGORY_LABELS[value as InquiryCategory]}
          color={CATEGORY_COLORS[value as InquiryCategory]}
          size="small"
        />
      ),
    },
    {
      field: 'subject',
      headerName: '제목',
      flex: 1,
      minWidth: 200,
      renderCell: ({ value }) => (
        <Typography
          variant="body2"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
            cursor: 'pointer',
          }}
        >
          {value}
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: '상태',
      width: 110,
      renderCell: ({ value }) => (
        <Chip
          label={STATUS_LABELS[value as InquiryStatus]}
          color={STATUS_COLORS[value as InquiryStatus]}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'admin_reply',
      headerName: '답변',
      width: 80,
      renderCell: ({ value }) => (
        <Typography variant="body2" color={value ? 'success.main' : 'text.disabled'}>
          {value ? '있음' : '없음'}
        </Typography>
      ),
    },
    {
      field: 'created_at',
      headerName: '접수일시',
      width: 150,
      renderCell: ({ value }) => (
        <Typography variant="body2" color="text.secondary">
          {dayjs(value as string).format('YYYY.MM.DD HH:mm')}
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      {/* 헤더 */}
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            문의 관리
          </Typography>
          <Typography variant="body2" color="text.secondary">
            총 {inquiries.length}건 · 필터 결과 {filtered.length}건
          </Typography>
        </Box>
      </Stack>

      {/* 필터 */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="제목 또는 내용 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220 }}
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
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>상태</InputLabel>
          <Select
            value={statusFilter}
            label="상태"
            onChange={(e) => setStatusFilter(e.target.value as InquiryStatus | 'all')}
          >
            <MenuItem value="all">전체</MenuItem>
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>카테고리</InputLabel>
          <Select
            value={categoryFilter}
            label="카테고리"
            onChange={(e) => setCategoryFilter(e.target.value as InquiryCategory | 'all')}
          >
            <MenuItem value="all">전체</MenuItem>
            {(Object.keys(CATEGORY_LABELS) as InquiryCategory[]).map((c) => (
              <MenuItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {/* 오류 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          데이터를 불러오지 못했습니다.
        </Alert>
      )}

      {/* 데이터 그리드 */}
      <Box sx={{ bgcolor: 'white', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={isLoading}
          autoHeight
          pageSizeOptions={[20, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 20 } } }}
          onRowClick={({ row }) => setSelectedInquiry(row as Inquiry)}
          sx={{
            border: 'none',
            '& .MuiDataGrid-row': { cursor: 'pointer' },
            '& .MuiDataGrid-row:hover': { bgcolor: 'action.hover' },
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'grey.50',
              borderRadius: '8px 8px 0 0',
            },
          }}
          localeText={{
            noRowsLabel: '문의 내역이 없습니다.',
          }}
        />
      </Box>

      {/* 상세 Drawer */}
      <InquiryDetailDrawer
        inquiry={selectedInquiry}
        onClose={() => setSelectedInquiry(null)}
      />
    </Box>
  );
}
