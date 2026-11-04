import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PetsIcon from '@mui/icons-material/Pets';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabaseAdmin } from '../api/supabaseClient';

/**
 * app_settings.card_mode — 오늘의 추천 카드 모드 (플랫폼별).
 * dog: 강아지 우선 v2 (멍멍이 2마리 중 선택, 나머지 쿠키). iOS 4.3(b) 대응.
 * person: 사람 카드 v1.
 * 앱은 시작 시 1회 읽어 고정. 바꾸면 앱 재시작 후 반영.
 */
type Mode = 'dog' | 'person';
type Setting = { ios: Mode; android: Mode };
const DEFAULT: Setting = { ios: 'dog', android: 'person' };

async function fetchCardMode(): Promise<Setting> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'card_mode')
    .maybeSingle();
  if (error) throw error;
  return { ...DEFAULT, ...((data?.value ?? {}) as Partial<Setting>) };
}

async function saveCardMode(value: Setting) {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert({ key: 'card_mode', value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export default function CardModeCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['card-mode'], queryFn: fetchCardMode });
  const [form, setForm] = useState<Setting>(DEFAULT);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  const mutation = useMutation({
    mutationFn: saveCardMode,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['card-mode'] }),
  });

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
          <PetsIcon fontSize="small" color="action" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            오늘의 추천 카드 모드
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          강아지 우선(dog): 멍멍이 2마리 중 선택, 나머지는 쿠키 · 강아지 소개 20자 필수. 사람 카드(person): 기존 v1.
          앱 시작 시 읽으므로 변경 후 앱을 다시 켜야 반영됩니다.
        </Typography>
        <Grid container spacing={2}>
          {(['ios', 'android'] as const).map((p) => (
            <Grid size={{ xs: 12, md: 6 }} key={p}>
              <TextField
                select
                size="small"
                fullWidth
                label={p === 'ios' ? 'iOS' : 'Android'}
                value={form[p]}
                onChange={(e) => setForm((f) => ({ ...f, [p]: e.target.value as Mode }))}
              >
                <MenuItem value="dog">강아지 우선 (dog)</MenuItem>
                <MenuItem value="person">사람 카드 (person)</MenuItem>
              </TextField>
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            variant="contained"
            disabled={isLoading || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            저장
          </Button>
          {mutation.isSuccess && <Alert severity="success" sx={{ py: 0 }}>저장됨</Alert>}
          {mutation.isError && (
            <Alert severity="error" sx={{ py: 0 }}>
              {(mutation.error as Error).message}
            </Alert>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
