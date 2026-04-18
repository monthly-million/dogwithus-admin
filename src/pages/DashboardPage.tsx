import { Box, Grid, Typography, Card, CardContent, Skeleton } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import PeopleIcon from '@mui/icons-material/People';
import PetsIcon from '@mui/icons-material/Pets';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ChatIcon from '@mui/icons-material/Chat';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { supabase } from '../api/supabaseClient';
import StatCard from '../components/StatCard';
import dayjs from 'dayjs';

async function fetchStats() {
  const today = dayjs().format('YYYY-MM-DD');
  const [users, dogs, matches, chatRooms, todayUsers] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('dogs').select('*', { count: 'exact', head: true }),
    supabase.from('matches').select('*', { count: 'exact', head: true }),
    supabase.from('chat_rooms').select('*', { count: 'exact', head: true }),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`),
  ]);

  return {
    totalUsers: users.count ?? 0,
    totalDogs: dogs.count ?? 0,
    totalMatches: matches.count ?? 0,
    totalChatRooms: chatRooms.count ?? 0,
    todayUsers: todayUsers.count ?? 0,
  };
}

async function fetchDailySignups() {
  const since = dayjs().subtract(13, 'day').format('YYYY-MM-DD');
  const { data } = await supabase
    .from('users')
    .select('created_at')
    .gte('created_at', `${since}T00:00:00`)
    .order('created_at', { ascending: true });

  const map: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day').format('MM/DD');
    map[d] = 0;
  }
  data?.forEach((u) => {
    const d = dayjs(u.created_at).format('MM/DD');
    if (map[d] !== undefined) map[d]++;
  });

  return Object.entries(map).map(([date, count]) => ({ date, 가입자: count }));
}

async function fetchDailyMatches() {
  const since = dayjs().subtract(13, 'day').format('YYYY-MM-DD');
  const { data } = await supabase
    .from('matches')
    .select('created_at')
    .gte('created_at', `${since}T00:00:00`)
    .order('created_at', { ascending: true });

  const map: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = dayjs().subtract(i, 'day').format('MM/DD');
    map[d] = 0;
  }
  data?.forEach((m) => {
    const d = dayjs(m.created_at).format('MM/DD');
    if (map[d] !== undefined) map[d]++;
  });

  return Object.entries(map).map(([date, count]) => ({ date, 매칭: count }));
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchStats,
  });

  const { data: signupData, isLoading: signupLoading } = useQuery({
    queryKey: ['daily-signups'],
    queryFn: fetchDailySignups,
  });

  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ['daily-matches'],
    queryFn: fetchDailyMatches,
  });

  const statCards = [
    { title: '총 유저 수', value: stats?.totalUsers ?? 0, icon: <PeopleIcon />, color: '#1976d2' },
    { title: '총 강아지 수', value: stats?.totalDogs ?? 0, icon: <PetsIcon />, color: '#2e7d32' },
    { title: '총 매칭 수', value: stats?.totalMatches ?? 0, icon: <FavoriteIcon />, color: '#c62828' },
    { title: '총 채팅방 수', value: stats?.totalChatRooms ?? 0, icon: <ChatIcon />, color: '#7b1fa2' },
    { title: '오늘 신규 유저', value: stats?.todayUsers ?? 0, icon: <PersonAddIcon />, color: '#ef6c00' },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        대시보드
      </Typography>

      {/* 통계 카드 */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {statCards.map((card) => (
          <Grid size={{ xs: 12, sm: 6, lg: 2.4 }} key={card.title}>
            <StatCard {...card} loading={statsLoading} />
          </Grid>
        ))}
      </Grid>

      {/* 차트 */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                일별 가입자 수 (최근 14일)
              </Typography>
              {signupLoading ? (
                <Skeleton variant="rectangular" height={220} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={signupData}>
                    <defs>
                      <linearGradient id="colorUser" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1976d2" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#1976d2" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="가입자"
                      stroke="#1976d2"
                      fill="url(#colorUser)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                일별 매칭 수 (최근 14일)
              </Typography>
              {matchLoading ? (
                <Skeleton variant="rectangular" height={220} />
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={matchData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="매칭" fill="#c62828" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
