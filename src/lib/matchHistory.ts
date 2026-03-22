import { MatchRecord } from '@/types/game';

const STORAGE_KEY = 'checkers_match_history';

export function getMatchHistory(userId: string): MatchRecord[] {
  const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
  return stored ? JSON.parse(stored) : [];
}

export function saveMatch(userId: string, match: MatchRecord): void {
  const history = getMatchHistory(userId);
  history.unshift(match);
  // Keep last 50 matches
  if (history.length > 50) history.length = 50;
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(history));
}
