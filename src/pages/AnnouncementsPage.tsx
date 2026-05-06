import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Stack,
  TextField,
  InputAdornment,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Drawer,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
  CircularProgress,
  Alert,
  Tooltip,
  TablePagination,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import PushPinIcon from '@mui/icons-material/PushPin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseAdmin } from '../api/supabaseClient';
import dayjs from 'dayjs';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type Category = 'general' | 'update' | 'event' | 'maintenance' | 'important';

interface Announcement {
  id: string;
  title: string;
  body: string;
  category: Category;
  is_pinned: boolean;
  published_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  push_sent: boolean;
  push_sent_at: string | null;
}

interface AnnouncementForm {
  title: string;
  body: string;
  category: Category;
  is_pinned: boolean;
  published_at: string;
}

const CATEGORY_META: Record<Category, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  general: { label: '일반', color: 'default' },
  update: { label: '업데이트', color: 'primary' },
  event: { label: '이벤트', color: 'success' },
  maintenance: { label: '점검', color: 'warning' },
  important: { label: '중요', color: 'error' },
};

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: 'general', label: '일반' },
  { value: 'update', label: '업데이트' },
  { value: 'event', label: '이벤트' },
  { value: 'maintenance', label: '점검' },
  { value: 'important', label: '중요' },
];

const DEFAULT_FORM: AnnouncementForm = {
  title: '',
  body: '',
  category: 'general',
  is_pinned: false,
  published_at: dayjs().format('YYYY-MM-DDTHH:mm'),
};

// ─── API ───────────────────────────────────────────────────────────────────────

async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabaseAdmin
    .from('announcements')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false });
  if (error) throw error;
  return data as Announcement[];
}

async function createAnnouncement(form: AnnouncementForm): Promise<void> {
  const { error } = await supabaseAdmin.from('announcements').insert([
    {
      title: form.title,
      body: form.body,
      category: form.category,
      is_pinned: form.is_pinned,
      published_at: new Date(form.published_at).toISOString(),
    },
  ]);
  if (error) throw error;
}

async function updateAnnouncement(id: string, form: AnnouncementForm): Promise<void> {
  const { error } = await supabaseAdmin
    .from('announcements')
    .update({
      title: form.title,
      body: form.body,
      category: form.category,
      is_pinned: form.is_pinned,
      published_at: new Date(form.published_at).toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('announcements').delete().eq('id', id);
  if (error) throw error;
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // 상세 Drawer
  const [detailItem, setDetailItem] = useState<Announcement | null>(null);

  // 등록/수정 Dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(DEFAULT_FORM);
  const [formError, setFormError] = useState('');

  // 삭제 Dialog
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);

  // ─── Query ──────────────────────────────────────────────────────────────────

  const {
    data: announcements = [],
    isLoading,
    error: fetchError,
  } = useQuery({ queryKey: ['announcements'], queryFn: fetchAnnouncements });

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: createAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setFormOpen(false);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: AnnouncementForm }) => updateAnnouncement(id, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setFormOpen(false);
      // 상세 Drawer에 열려 있으면 최신 데이터로 교체
      if (detailItem) {
        setDetailItem((prev) =>
          prev ? { ...prev, ...form, published_at: new Date(form.published_at).toISOString() } : null,
        );
      }
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setDeleteTarget(null);
      if (detailItem?.id === deleteTarget?.id) setDetailItem(null);
    },
  });

  // ─── 필터 ────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return announcements.filter((a) => {
      const matchSearch =
        !search ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.body.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === 'all' || a.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [announcements, search, categoryFilter]);

  const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // ─── 핸들러 ─────────────────────────────────────────────────────────────────

  function openCreate() {
    setEditTarget(null);
    setForm(DEFAULT_FORM);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(item: Announcement, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditTarget(item);
    setForm({
      title: item.title,
      body: item.body,
      category: item.category,
      is_pinned: item.is_pinned,
      published_at: dayjs(item.published_at).format('YYYY-MM-DDTHH:mm'),
    });
    setFormError('');
    setFormOpen(true);
  }

  function handleFormSubmit() {
    if (!form.title.trim()) { setFormError('제목을 입력해주세요.'); return; }
    if (!form.body.trim()) { setFormError('내용을 입력해주세요.'); return; }
    setFormError('');
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box>
      {/* 헤더 */}
      <Typography variant="h5" fontWeight={700} mb={3}>
        공지사항
      </Typography>

      {/* 필터 바 */}
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={2} mb={2}>
        <TextField
          size="small"
          placeholder="제목·내용 검색"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>카테고리</InputLabel>
          <Select
            value={categoryFilter}
            label="카테고리"
            onChange={(e) => { setCategoryFilter(e.target.value as Category | 'all'); setPage(0); }}
          >
            <MenuItem value="all">전체</MenuItem>
            {CATEGORY_OPTIONS.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          새 공지 등록
        </Button>
      </Stack>

      {/* 오류 */}
      {fetchError && <Alert severity="error" sx={{ mb: 2 }}>{(fetchError as Error).message}</Alert>}

      {/* 테이블 */}
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell width={40} />
                <TableCell>제목</TableCell>
                <TableCell width={100}>카테고리</TableCell>
                <TableCell width={160}>게시일시</TableCell>
                <TableCell width={80} align="center">푸시</TableCell>
                <TableCell width={100} align="center">작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    공지사항이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((item) => (
                  <TableRow
                    key={item.id}
                    hover
                    onClick={() => setDetailItem(item)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      {item.is_pinned && (
                        <Tooltip title="고정">
                          <PushPinIcon fontSize="small" color="error" />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={item.is_pinned ? 700 : 400} noWrap sx={{ maxWidth: 360 }}>
                        {item.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={CATEGORY_META[item.category].label}
                        color={CATEGORY_META[item.category].color}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {dayjs(item.published_at).format('YYYY-MM-DD HH:mm')}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {item.push_sent ? (
                        <Chip label="발송됨" size="small" color="success" variant="outlined" />
                      ) : (
                        <Chip label="미발송" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" justifyContent="center" spacing={0.5}>
                        <Tooltip title="수정">
                          <IconButton size="small" onClick={(e) => openEdit(item, e)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="삭제">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="페이지당"
        />
      </Paper>

      {/* ─── 상세 Drawer ─────────────────────────────────────────────────────── */}
      <Drawer
        anchor="right"
        open={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        PaperProps={{ sx: { width: { xs: '100vw', sm: 520 }, p: 0 } }}
      >
        {detailItem && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Drawer 헤더 */}
            <Box
              sx={{
                px: 3,
                py: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                {detailItem.is_pinned && <PushPinIcon fontSize="small" color="error" />}
                <Chip
                  label={CATEGORY_META[detailItem.category].label}
                  color={CATEGORY_META[detailItem.category].color}
                  size="small"
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(detailItem)}>
                  수정
                </Button>
                <Button
                  size="small"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setDeleteTarget(detailItem)}
                >
                  삭제
                </Button>
                <IconButton size="small" onClick={() => setDetailItem(null)}>
                  <CloseIcon />
                </IconButton>
              </Stack>
            </Box>

            {/* Drawer 본문 */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3 }}>
              <Typography variant="h6" fontWeight={700} gutterBottom>
                {detailItem.title}
              </Typography>

              <Stack direction="row" spacing={2} mb={3}>
                <Typography variant="caption" color="text.secondary">
                  게시일시: {dayjs(detailItem.published_at).format('YYYY-MM-DD HH:mm')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  수정일: {dayjs(detailItem.updated_at).format('YYYY-MM-DD HH:mm')}
                </Typography>
              </Stack>

              <Divider sx={{ mb: 3 }} />

              <Typography
                variant="body1"
                sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}
              >
                {detailItem.body}
              </Typography>
            </Box>

            {/* Drawer 푸터 */}
            <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={2}>
                <Typography variant="caption" color="text.secondary">
                  푸시 발송:{' '}
                  {detailItem.push_sent
                    ? `발송됨 (${dayjs(detailItem.push_sent_at).format('YYYY-MM-DD HH:mm')})`
                    : '미발송'}
                </Typography>
              </Stack>
            </Box>
          </Box>
        )}
      </Drawer>

      {/* ─── 등록/수정 Dialog ────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onClose={() => !isSaving && setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editTarget ? '공지 수정' : '새 공지 등록'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} pt={1}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="제목"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              fullWidth
              required
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              label="내용"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              fullWidth
              required
              multiline
              minRows={6}
              maxRows={16}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>카테고리</InputLabel>
                <Select
                  value={form.category}
                  label="카테고리"
                  onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="게시일시"
                type="datetime-local"
                value={form.published_at}
                onChange={(e) => setForm({ ...form, published_at: e.target.value })}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Switch
                  checked={form.is_pinned}
                  onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
                  color="error"
                />
              }
              label="상단 고정"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setFormOpen(false)} disabled={isSaving}>
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleFormSubmit}
            disabled={isSaving}
            startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {editTarget ? '저장' : '등록'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── 삭제 확인 Dialog ────────────────────────────────────────────────── */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>공지 삭제</DialogTitle>
        <DialogContent>
          <Typography>
            <strong>"{deleteTarget?.title}"</strong> 공지사항을 삭제하시겠습니까?<br />
            삭제된 공지는 복구할 수 없습니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
            취소
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            disabled={deleteMutation.isPending}
            startIcon={deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
