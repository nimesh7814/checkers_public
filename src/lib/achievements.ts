import { MatchRecord } from '@/types/game';
import { getMatchHistory } from '@/lib/matchHistory';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  category: 'milestone' | 'streak' | 'skill' | 'dedication';
  check: (matches: MatchRecord[]) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Milestones
  { id: 'first_game', name: 'Getting Started', description: 'Play your first game', icon: '🎮', category: 'milestone', check: (m) => m.length >= 1 },
  { id: 'first_win', name: 'First Victory', description: 'Win your first game', icon: '🏆', category: 'milestone', check: (m) => m.some(g => g.result === 'win') },
  { id: 'ten_games', name: 'Regular Player', description: 'Play 10 games', icon: '🎯', category: 'milestone', check: (m) => m.length >= 10 },
  { id: 'twenty_five_games', name: 'Dedicated Player', description: 'Play 25 games', icon: '💪', category: 'milestone', check: (m) => m.length >= 25 },
  { id: 'fifty_games', name: 'Veteran', description: 'Play 50 games', icon: '🎖️', category: 'milestone', check: (m) => m.length >= 50 },

  // Streaks
  { id: 'win_streak_3', name: 'Hat Trick', description: 'Win 3 games in a row', icon: '🔥', category: 'streak', check: (m) => hasWinStreak(m, 3) },
  { id: 'win_streak_5', name: 'On Fire', description: 'Win 5 games in a row', icon: '💥', category: 'streak', check: (m) => hasWinStreak(m, 5) },
  { id: 'win_streak_10', name: 'Unstoppable', description: 'Win 10 games in a row', icon: '⚡', category: 'streak', check: (m) => hasWinStreak(m, 10) },
  { id: 'no_losses_5', name: 'Unbreakable', description: 'Play 5 games without a loss', icon: '🛡️', category: 'streak', check: (m) => hasNoLossStreak(m, 5) },

  // Skill
  { id: 'capture_10', name: 'Collector', description: 'Capture 10 pieces total', icon: '🧲', category: 'skill', check: (m) => totalCaptures(m) >= 10 },
  { id: 'capture_50', name: 'Hunter', description: 'Capture 50 pieces total', icon: '🏹', category: 'skill', check: (m) => totalCaptures(m) >= 50 },
  { id: 'capture_100', name: 'Annihilator', description: 'Capture 100 pieces total', icon: '💀', category: 'skill', check: (m) => totalCaptures(m) >= 100 },
  { id: 'beat_hard', name: 'Giant Slayer', description: 'Beat the Hard AI', icon: '🗡️', category: 'skill', check: (m) => m.some(g => g.aiDifficulty === 'hard' && g.result === 'win') },
  { id: 'quick_win', name: 'Speed Demon', description: 'Win a game in under 2 minutes', icon: '⏱️', category: 'skill', check: (m) => m.some(g => g.result === 'win' && g.duration < 120) },
  { id: 'long_game', name: 'Marathon', description: 'Play a game lasting over 8 minutes', icon: '🏃', category: 'skill', check: (m) => m.some(g => g.duration > 480) },

  // Dedication
  { id: 'five_wins', name: 'Rising Star', description: 'Win 5 games', icon: '⭐', category: 'dedication', check: (m) => m.filter(g => g.result === 'win').length >= 5 },
  { id: 'ten_wins', name: 'Champion', description: 'Win 10 games', icon: '👑', category: 'dedication', check: (m) => m.filter(g => g.result === 'win').length >= 10 },
  { id: 'twenty_five_wins', name: 'Legend', description: 'Win 25 games', icon: '🏅', category: 'dedication', check: (m) => m.filter(g => g.result === 'win').length >= 25 },
  { id: 'all_difficulties', name: 'Well-Rounded', description: 'Beat Easy, Moderate, and Hard AI', icon: '🌟', category: 'dedication', check: (m) => ['easy', 'moderate', 'hard'].every(d => m.some(g => g.aiDifficulty === d && g.result === 'win')) },
];

function hasWinStreak(matches: MatchRecord[], count: number): boolean {
  let streak = 0;
  for (const m of matches) {
    if (m.result === 'win') { streak++; if (streak >= count) return true; }
    else streak = 0;
  }
  return false;
}

function hasNoLossStreak(matches: MatchRecord[], count: number): boolean {
  let streak = 0;
  for (const m of matches) {
    if (m.result !== 'loss') { streak++; if (streak >= count) return true; }
    else streak = 0;
  }
  return false;
}

function totalCaptures(matches: MatchRecord[]): number {
  return matches.reduce((s, m) => s + m.capturedByPlayer, 0);
}

export function getUnlockedAchievements(userId: string): string[] {
  const matches = getMatchHistory(userId);
  return ACHIEVEMENTS.filter(a => a.check(matches)).map(a => a.id);
}

export function getNewAchievements(userId: string, previousUnlocked: string[]): Achievement[] {
  const current = getUnlockedAchievements(userId);
  return current
    .filter(id => !previousUnlocked.includes(id))
    .map(id => ACHIEVEMENTS.find(a => a.id === id)!)
    .filter(Boolean);
}
