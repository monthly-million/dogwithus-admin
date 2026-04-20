import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Divider,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockIcon from '@mui/icons-material/Lock';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmailIcon from '@mui/icons-material/Email';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../api/supabaseClient';

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const { changePassword, session } = useAuth();

  // 이메일 복구 링크 클릭 시 type=recovery 세션 감지
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const passwordStrength = (): { level: number; label: string; color: string } => {
    if (newPassword.length === 0) return { level: 0, label: '', color: 'grey.300' };
    if (newPassword.length < 6) return { level: 1, label: '너무 짧음', color: 'error.main' };
    if (newPassword.length < 8) return { level: 2, label: '보통', color: 'warning.main' };
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasLower = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
    const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    if (score >= 3) return { level: 4, label: '강함', color: 'success.main' };
    return { level: 3, label: '양호', color: 'info.main' };
  };

  const strength = passwordStrength();

  const handleSendResetEmail = async () => {
    if (!session?.user?.email) return;
    setResetError('');
    setResetSuccess(false);
    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}#/change-password`,
    });

    if (error) {
      setResetError(`복구 이메일 전송 실패: ${error.message}`);
    } else {
      setResetSuccess(true);
    }
    setResetLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    const { error } = await changePassword(newPassword);

    if (error) {
      setError(`비밀번호 변경 실패: ${error.message}`);
    } else {
      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    }
    setLoading(false);
  };

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        비밀번호 변경
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {session?.user?.email} 계정의 비밀번호를 변경합니다.
      </Typography>

      {isRecoveryMode && (
        <Alert severity="info" icon={<EmailIcon fontSize="inherit" />} sx={{ mb: 2, borderRadius: 2 }}>
          이메일의 복구 링크를 통해 접속했습니다. 아래에서 새 비밀번호를 설정해주세요.
        </Alert>
      )}

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: 3,
              p: 2,
              bgcolor: 'primary.50',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'primary.100',
            }}
          >
            <LockIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 500 }}>
              보안을 위해 주기적으로 비밀번호를 변경해주세요.
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert
              severity="success"
              icon={<CheckCircleIcon fontSize="inherit" />}
              sx={{ mb: 3 }}
            >
              비밀번호가 성공적으로 변경되었습니다.
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
          >
            <Box>
              <TextField
                label="새 비밀번호"
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setSuccess(false);
                }}
                required
                fullWidth
                autoComplete="new-password"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          edge="end"
                        >
                          {showNewPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {newPassword.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          bgcolor: i <= strength.level ? strength.color : 'grey.200',
                          transition: 'background-color 0.2s',
                        }}
                      />
                    ))}
                  </Box>
                  <Typography variant="caption" sx={{ color: strength.color, fontWeight: 500 }}>
                    {strength.label}
                  </Typography>
                </Box>
              )}
            </Box>

            <TextField
              label="새 비밀번호 확인"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setSuccess(false);
              }}
              required
              fullWidth
              autoComplete="new-password"
              error={confirmPassword.length > 0 && newPassword !== confirmPassword}
              helperText={
                confirmPassword.length > 0 && newPassword !== confirmPassword
                  ? '비밀번호가 일치하지 않습니다.'
                  : confirmPassword.length > 0 && newPassword === confirmPassword
                    ? '비밀번호가 일치합니다.'
                    : ''
              }
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
                formHelperText: {
                  sx: {
                    color:
                      confirmPassword.length > 0 && newPassword === confirmPassword
                        ? 'success.main'
                        : undefined,
                  },
                },
              }}
            />

            <Divider sx={{ my: 0.5 }} />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ borderRadius: 2, py: 1.5 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : '비밀번호 변경'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* 비밀번호 재설정 카드 */}
      <Card
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, mt: 3 }}
      >
        <CardContent sx={{ p: 4 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            비밀번호 재설정
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            사용자에게 비밀번호 복구 이메일을 보내세요
          </Typography>

          {resetError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {resetError}
            </Alert>
          )}

          {resetSuccess && (
            <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />} sx={{ mb: 2 }}>
              <strong>{session?.user?.email}</strong>으로 복구 이메일을 전송했습니다. 받은편지함을
              확인해주세요.
            </Alert>
          )}

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmailIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2" color="text.secondary">
                {session?.user?.email}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={
                resetLoading ? <CircularProgress size={16} color="inherit" /> : <EmailIcon />
              }
              onClick={handleSendResetEmail}
              disabled={resetLoading}
              sx={{ borderRadius: 2, whiteSpace: 'nowrap' }}
            >
              비밀번호 복구 전송
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
