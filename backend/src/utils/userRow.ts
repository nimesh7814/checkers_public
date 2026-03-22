// Converts a raw DB row into the User shape the frontend expects.
export function userRow(row: Record<string, unknown>) {
  const rawBirthday = row.birthday;
  const birthday = rawBirthday instanceof Date
    ? rawBirthday.toISOString().slice(0, 10)
    : typeof rawBirthday === 'string'
      ? rawBirthday.slice(0, 10)
      : null;

  const gp = (row.games_played as number) || 0;
  const wins = (row.wins as number) || 0;
  return {
    id:          row.id,
    username:    row.username,
    email:       row.email || '',
    firstName:   row.first_name,
    lastName:    row.last_name,
    birthday,
    avatar:      row.avatar ?? null,
    country:     row.country ?? '',
    countryCode: row.country_code ?? '',
    isOnline:    row.is_online ?? false,
    stats: {
      gamesPlayed: gp,
      wins,
      losses: (row.losses as number) || 0,
      draws:  (row.draws  as number) || 0,
      winRate: gp > 0 ? Math.round((wins / gp) * 100) : 0,
    },
    preferences: {
      boardTheme:        row.board_theme        ?? 'classic',
      checkerColor:      row.checker_color      ?? 'white',
      soundEnabled:      row.sound_enabled      !== false,
      animationsEnabled: row.animations_enabled !== false,
    },
  };
}
