import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { getMatchHistory } from '@/lib/matchHistory';
import CountryFlag from '@/components/CountryFlag';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { MatchRecord } from '@/types/game';
import {
  ArrowLeft, Crown, Trophy, Target, TrendingUp, Clock,
  Swords, Flame, Shield, Zap,
} from 'lucide-react';

/* ─── tiny bar chart (no deps) ─── */
const MiniBarChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">{d.value}</span>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(d.value / max) * 100}%` }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="w-full rounded-t-sm min-h-[2px]"
            style={{ backgroundColor: d.color }}
          />
          <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

/* ─── donut ring ─── */
const WinRateRing: React.FC<{ rate: number }> = ({ rate }) => {
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (rate / 100) * c;
  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
        <motion.circle
          cx="50" cy="50" r={r} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-foreground tabular-nums">{rate}%</span>
        <span className="text-[10px] text-muted-foreground">Win Rate</span>
      </div>
    </div>
  );
};

/* ─── streak helper ─── */
function computeStreak(matches: MatchRecord[]): { current: number; best: number; type: 'win' | 'loss' | 'none' } {
  if (matches.length === 0) return { current: 0, best: 0, type: 'none' };
  let currentType = matches[0].result;
  let current = 0;
  for (const m of matches) {
    if (m.result === currentType) current++;
    else break;
  }
  // best win streak
  let best = 0, run = 0;
  for (const m of matches) {
    if (m.result === 'win') { run++; best = Math.max(best, run); }
    else run = 0;
  }
  return { current, best, type: currentType === 'draw' ? 'none' : currentType };
}

/* ─── recent form (last 10) ─── */
const RecentForm: React.FC<{ matches: MatchRecord[] }> = ({ matches }) => {
  const last10 = matches.slice(0, 10);
  return (
    <div className="flex gap-1">
      {last10.map((m, i) => (
        <div
          key={i}
          className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold ${
            m.result === 'win'
              ? 'bg-primary/20 text-primary'
              : m.result === 'loss'
              ? 'bg-destructive/20 text-destructive'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}
        </div>
      ))}
      {last10.length === 0 && <span className="text-xs text-muted-foreground">No games yet</span>}
    </div>
  );
};

const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const matches = useMemo(() => user ? getMatchHistory(user.id) : [], [user?.id]);
  const streak = useMemo(() => computeStreak(matches), [matches]);

  const totalCaptures = matches.reduce((s, m) => s + m.capturedByPlayer, 0);
  const avgDuration = matches.length > 0
    ? Math.round(matches.reduce((s, m) => s + m.duration, 0) / matches.length)
    : 0;
  const totalMoves = matches.reduce((s, m) => s + m.moves.length, 0);

  // Results by difficulty
  const byDifficulty = useMemo(() => {
    const map: Record<string, { w: number; l: number; d: number }> = {};
    matches.filter(m => m.gameType === 'ai').forEach(m => {
      const key = m.aiDifficulty || 'unknown';
      if (!map[key]) map[key] = { w: 0, l: 0, d: 0 };
      if (m.result === 'win') map[key].w++;
      else if (m.result === 'loss') map[key].l++;
      else map[key].d++;
    });
    return map;
  }, [matches]);

  // Last 8 matches for performance trend
  const performanceTrend = useMemo(() => {
    return matches.slice(0, 8).reverse().map((m, i) => ({
      label: `#${i + 1}`,
      value: m.result === 'win' ? 3 : m.result === 'draw' ? 1 : 0,
      color: m.result === 'win'
        ? 'hsl(var(--primary))'
        : m.result === 'draw'
        ? 'hsl(var(--muted-foreground))'
        : 'hsl(var(--destructive))',
    }));
  }, [matches]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  if (!user) { navigate('/'); return null; }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-semibold text-foreground">Player Profile</h1>
      </header>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-card p-6 flex flex-col sm:flex-row items-center gap-6"
        >
          <PlayerAvatar username={user.username} src={user.avatar} size={80} />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <h2 className="text-2xl font-bold text-foreground">{user.username}</h2>
              <CountryFlag code={user.countryCode} className="h-5 w-7" title={user.country} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {user.firstName} {user.lastName} · {user.country}
            </p>
            <div className="mt-3">
              <RecentForm matches={matches} />
            </div>
          </div>
          <WinRateRing rate={user.stats.winRate} />
        </motion.div>

        {/* Key Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Swords, label: 'Games Played', value: user.stats.gamesPlayed, accent: false },
            { icon: Trophy, label: 'Wins', value: user.stats.wins, accent: true },
            { icon: Shield, label: 'Losses', value: user.stats.losses, accent: false },
            { icon: Target, label: 'Draws', value: user.stats.draws, accent: false },
          ].map(s => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="surface-card p-4 text-center"
            >
              <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.accent ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="text-2xl font-bold text-foreground tabular-nums">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Two-column: Performance + Insights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Performance Trend */}
          <div className="surface-card p-5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Recent Performance
            </h3>
            {performanceTrend.length > 0 ? (
              <MiniBarChart data={performanceTrend} />
            ) : (
              <p className="text-sm text-muted-foreground">Play games to see your trend</p>
            )}
          </div>

          {/* Insights */}
          <div className="surface-card p-5 space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Insights
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-primary" /> Current Streak
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {streak.current} {streak.type === 'win' ? '🔥' : streak.type === 'loss' ? '❄️' : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-primary" /> Best Win Streak
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">{streak.best}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-primary" /> Total Captures
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">{totalCaptures}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" /> Avg Duration
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {avgDuration > 0 ? formatDuration(avgDuration) : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-primary" /> Total Moves
                </span>
                <span className="text-sm font-medium text-foreground tabular-nums">{totalMoves}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Win Rate by AI Difficulty */}
        {Object.keys(byDifficulty).length > 0 && (
          <div className="surface-card p-5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5" /> Results by AI Difficulty
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {(['easy', 'moderate', 'hard'] as const).map(diff => {
                const d = byDifficulty[diff];
                if (!d) return (
                  <div key={diff} className="bg-secondary rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground capitalize mb-1">{diff}</div>
                    <div className="text-sm text-muted-foreground">—</div>
                  </div>
                );
                const total = d.w + d.l + d.d;
                const wr = total > 0 ? Math.round((d.w / total) * 100) : 0;
                return (
                  <div key={diff} className="bg-secondary rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground capitalize mb-1">{diff}</div>
                    <div className="text-lg font-bold text-foreground tabular-nums">{wr}%</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {d.w}W {d.l}L {d.d}D
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Matches */}
        <div className="surface-card p-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Recent Matches
          </h3>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No matches yet. Play a game to see your history!
            </p>
          ) : (
            <div className="space-y-2">
              {matches.slice(0, 10).map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2 px-3 rounded-md bg-secondary/50">
                  <div className={`w-2 h-2 rounded-full ${
                    m.result === 'win' ? 'bg-primary' : m.result === 'loss' ? 'bg-destructive' : 'bg-muted-foreground'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        vs {m.opponentName}
                      </span>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        m.result === 'win'
                          ? 'bg-primary/15 text-primary'
                          : m.result === 'loss'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {m.result.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {m.moves.length} moves · {formatDuration(m.duration)} · {new Date(m.date).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => navigate('/history')}
                  >
                    Replay
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
