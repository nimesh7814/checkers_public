import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import CountryFlag from '@/components/CountryFlag';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { User } from '@/types/game';
import { apiFetch } from '@/lib/api';
import { ArrowLeft, Crown, Medal, TrendingUp, Trophy } from 'lucide-react';

interface LeaderboardEntry {
  id: string;
  username: string;
  avatar: string | null;
  countryCode: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

const LeaderboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    apiFetch<{ users: User[] }>('/users')
      .then(data => {
        const entries: LeaderboardEntry[] = data.users.map(u => ({
          id: u.id,
          username: u.username,
          avatar: u.avatar,
          countryCode: u.countryCode,
          gamesPlayed: u.stats.gamesPlayed,
          wins: u.stats.wins,
          losses: u.stats.losses,
          draws: u.stats.draws,
          winRate: u.stats.winRate,
        }));
        // Sort by win rate desc, then games played desc
        entries.sort((a, b) => {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate;
          return b.gamesPlayed - a.gamesPlayed;
        });
        setLeaderboard(entries);
      })
      .catch(() => {});
  }, []);

  const getRankStyle = (rank: number) => {
    if (rank === 0) return { medal: '🥇', bg: 'bg-yellow-500/10 border-yellow-500/30' };
    if (rank === 1) return { medal: '🥈', bg: 'bg-gray-400/10 border-gray-400/30' };
    if (rank === 2) return { medal: '🥉', bg: 'bg-orange-500/10 border-orange-500/30' };
    return { medal: '', bg: '' };
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Trophy className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-foreground">Leaderboard</h1>
      </header>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Top 3 podium */}
        {leaderboard.length >= 1 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 0, 2].map(rank => {
              const entry = leaderboard[rank];
              if (!entry) return <div key={rank} />;
              const isTop = rank === 0;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: rank * 0.1 }}
                  className={`surface-card p-4 text-center ${isTop ? 'sm:-mt-4' : ''} border ${getRankStyle(rank).bg}`}
                >
                  <div className="text-2xl mb-2">{getRankStyle(rank).medal}</div>
                  <PlayerAvatar username={entry.username} src={entry.avatar} size={isTop ? 56 : 44} />
                  <div className="mt-2 flex items-center justify-center gap-1">
                    <span className="text-sm font-semibold text-foreground truncate">{entry.username}</span>
                    <CountryFlag code={entry.countryCode} className="h-4 w-6" title={entry.username} />
                  </div>
                  <div className="text-xl font-bold text-primary tabular-nums mt-1">{entry.winRate}%</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {entry.wins}W {entry.losses}L · {entry.gamesPlayed} games
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Full rankings table */}
        <div className="surface-card overflow-hidden">
          <div className="grid grid-cols-[3rem_1fr_4rem_4rem_4rem_4rem] gap-2 px-4 py-2 border-b border-border text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Win%</span>
            <span className="text-right">W</span>
            <span className="text-right">L</span>
            <span className="text-right">Games</span>
          </div>

          {leaderboard.length === 0 ? (
            <div className="text-center py-12">
              <Medal className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground">No players registered yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {leaderboard.map((entry, i) => {
                const isMe = entry.id === user?.id;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`grid grid-cols-[3rem_1fr_4rem_4rem_4rem_4rem] gap-2 px-4 py-3 items-center ${
                      isMe ? 'bg-primary/5' : 'hover:bg-accent/50'
                    } transition-colors`}
                  >
                    <span className="text-sm font-bold text-muted-foreground tabular-nums flex items-center gap-1">
                      {i < 3 ? getRankStyle(i).medal : `${i + 1}`}
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <PlayerAvatar username={entry.username} src={entry.avatar} size={28} />
                      <span className={`text-sm truncate ${isMe ? 'font-bold text-primary' : 'text-foreground'}`}>
                        {entry.username}
                      </span>
                      <CountryFlag code={entry.countryCode} className="h-4 w-6" title={entry.username} />
                      {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">You</span>}
                    </div>
                    <span className="text-sm font-semibold text-foreground tabular-nums text-right">{entry.winRate}%</span>
                    <span className="text-sm text-foreground tabular-nums text-right">{entry.wins}</span>
                    <span className="text-sm text-muted-foreground tabular-nums text-right">{entry.losses}</span>
                    <span className="text-sm text-muted-foreground tabular-nums text-right">{entry.gamesPlayed}</span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* User's rank summary */}
        {user && leaderboard.length > 0 && (
          <div className="surface-card p-4 flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <div className="text-sm text-foreground">
              Your rank: <span className="font-bold text-primary">
                #{leaderboard.findIndex(e => e.id === user.id) + 1}
              </span> of {leaderboard.length} players
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardPage;
