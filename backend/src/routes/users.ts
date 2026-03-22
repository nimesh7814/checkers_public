import { Router, Response } from 'express';
import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { userRow } from '../utils/userRow';

const router = Router();

// GET /api/users — list all users (for leaderboard & PvP selection)
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, first_name, last_name, avatar, country, country_code,
              is_online, games_played, wins, losses, draws, board_theme, checker_color,
              sound_enabled, animations_enabled
       FROM users
       ORDER BY wins DESC, games_played DESC`,
    );
    res.json({ users: rows.map(r => userRow(r)) });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/me — update current user's profile & preferences
router.patch('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  // Map camelCase frontend fields → snake_case DB columns
  const fieldMap: Record<string, string> = {
    firstName:  'first_name',
    lastName:   'last_name',
    birthday:   'birthday',
    avatar:     'avatar',
    country:    'country',
    countryCode: 'country_code',
  };
  const prefMap: Record<string, string> = {
    boardTheme:        'board_theme',
    checkerColor:      'checker_color',
    soundEnabled:      'sound_enabled',
    animationsEnabled: 'animations_enabled',
  };
  const statsMap: Record<string, string> = {
    gamesPlayed: 'games_played',
    wins:        'wins',
    losses:      'losses',
    draws:       'draws',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const addField = (obj: Record<string, unknown>, map: Record<string, string>) => {
    for (const [key, col] of Object.entries(map)) {
      if (obj[key] !== undefined) {
        setClauses.push(`${col} = $${idx++}`);
        values.push(obj[key]);
      }
    }
  };

  const { preferences, stats, ...rest } = req.body as {
    preferences?: Record<string, unknown>;
    stats?: Record<string, unknown>;
    [k: string]: unknown;
  };

  addField(rest, fieldMap);
  if (preferences) addField(preferences, prefMap);
  if (stats) addField(stats, statsMap);

  if (setClauses.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  values.push(req.userId);
  try {
    const { rows } = await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    res.json({ user: userRow(rows[0]) });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
