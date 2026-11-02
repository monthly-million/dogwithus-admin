import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabaseAdmin } from '../api/supabaseClient';

/**
 * app_settings.min_build — 앱 강제 업데이트.
 * 값: {ios:{min_build,url}, android:{min_build,url}}
 * 앱은 시작 시 자기 빌드 번호(pubspec +N)와 비교, 미만이면 업데이트 화면으로 전체 차단.
 * min_build 0 = 강제하지 않음.
 */
type PlatformSetting = { min_build: number; url: string };
type MinBuildSetting = { ios: PlatformSetting; android: PlatformSetting };

const EMPTY: MinBuildSetting = {
  ios: { min_build: 0, url: '' },
  android: { min_build: 0, url: '' },
};

async function fetchMinBuild(): Promise<MinBuildSetting> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'min_build')
    .maybeSingle();
  if (error) throw error;
  const v = (data?.value ?? {}) as Partial<MinBuildSetting>;
  return {
    ios: { ...EMPTY.ios, ...(v.ios ?? {}) },
    android: { ...EMPTY.android, ...(v.android ?? {}) },
  };
}

async function saveMinBuild(value: MinBuildSetting) {
  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert({ key: 'min_build', value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export default function ForceUpdateCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['min-build'], queryFn: fetchMinBuild });
  const [form, setForm] = useState<MinBuildSetting>(EMPTY);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: saveMinBuild,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['min-build'] }),
  });

  const field = (
    platform: 'ios' | 'android',
    key: keyof PlatformSetting,
    label: string,
  ) => (
    <TextField
      size="small"
      fullWidth
      label={label}
      type={key === 'min_build' ? 'number' : 'text'}
      value={form[platform][key]}
      onChange={(e) =>
        setForm((f) => ({
          ...f,
          [platform]: {
            ...f[platform],
            [key]: key === 'min_build' ? Number(e.target.value) || 0 : e.target.value,
          },
        }))
      }
    />
  );

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center' }}>
          <SystemUpdateIcon fontSize="small" color="action" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            앱 강제 업데이트
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          앱 빌드 번호(pubspec의 +N)가 아래 최소 빌드보다 낮으면 업데이트 화면만 보이고 이용이 막힙니다. 0이면
          강제하지 않습니다. URL이 비어 있으면 버튼 없이 안내 문구만 나갑니다.
        </Typography>
        <Grid container spacing={2}>
          {(['ios', 'android'] as const).map((p) => (
            <Grid size={{ xs: 12, md: 6 }} key={p}>
              <Stack spacing={1.5}>
                <Typography variant="overline">{p === 'ios' ? 'iOS' : 'Android'}</Typography>
                {field(p, 'min_build', '최소 빌드 번호')}
                {field(p, 'url', '스토어 URL')}
              </Stack>
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
