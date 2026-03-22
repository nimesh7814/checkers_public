import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { emitMatchMeta, emitMatchState } from '../realtime';

const router = Router();
const DISCONNECT_GRACE_MS = 10 * 60 * 1000;

type MatchStatus = 'active' | 'finished' | 'cancelled';

type MatchRow = {
  id: string;
  white_user_id: string;
  black_user_id: string;
  room_name: string | null;
  board_size: number;
  board_theme: 'classic' | 'wooden' | 'metal';
  status: MatchStatus;
  winner_user_id: string | null;
  winner_reason: 'timeout' | 'resign' | 'completed' | null;
  white_disconnected_at: string | null;
  black_disconnected_at: string | null;
  created_at: string;
  ended_at: string | null;
  game_state: unknown | null;
  state_revision: number;
  white_username: string;
  white_avatar: string | null;
  white_country: string;
  white_country_code: string;
  black_username: string;
  black_avatar: string | null;
  black_country: string;
  black_country_code: string;
};

type ClockSnapshot = {
  white: number;
  black: number;
};

type PersistedGameState = {
  moveHistory?: unknown;
  timer?: unknown;
  gameOver?: unknown;
  winner?: unknown;
};

function toIsoOrNull(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function parseClockSnapshot(state: PersistedGameState | null): ClockSnapshot | null {
  if (!state || typeof state !== 'object' || !state.timer || typeof state.timer !== 'object') {
    return null;
  }

  const timer = state.timer as Record<string, unknown>;
  const white = toIntOrNull(timer.white);
  const black = toIntOrNull(timer.black);
  if (white === null || black === null) return null;

  return { white, black };
}

function parseMoveHistory(state: PersistedGameState | null): string[] {
  if (!state || typeof state !== 'object' || !Array.isArray(state.moveHistory)) {
    return [];
  }

  return state.moveHistory.filter(item => typeof item === 'string') as string[];
}

async function persistMoveHistoryDelta(
  matchId: string,
  previousState: PersistedGameState | null,
  nextState: PersistedGameState,
  stateRevision: number,
): Promise<void> {
  const previousMoves = parseMoveHistory(previousState);
  const nextMoves = parseMoveHistory(nextState);
  const startIndex = previousMoves.length;
  if (nextMoves.length <= startIndex) return;

  const timer = parseClockSnapshot(nextState);

  for (let index = startIndex; index < nextMoves.length; index += 1) {
    const moveIndex = index + 1;
    const moveNotation = nextMoves[index];
    const moverColor = moveIndex % 2 === 1 ? 'white' : 'black';

    await pool.query(
      `INSERT INTO game_match_moves
         (match_id, move_index, move_notation, mover_color, elapsed_white_seconds, elapsed_black_seconds, state_revision, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (match_id, move_index) DO NOTHING`,
      [
        matchId,
        moveIndex,
        moveNotation,
        moverColor,
        timer?.white ?? null,
        timer?.black ?? null,
        stateRevision,
        JSON.stringify(nextState),
      ],
    );
  }
}

function parseWinnerColor(state: PersistedGameState): 'white' | 'black' | null {
  if (state.winner === 'white' || state.winner === 'black') {
    return state.winner;
  }
  return null;
}

function mapMatch(row: MatchRow, userId: string) {
  const isWhite = row.white_user_id === userId;
  const myColor = isWhite ? 'white' : 'black';
  const opponentId = isWhite ? row.black_user_id : row.white_user_id;
  const opponentUsername = isWhite ? row.black_username : row.white_username;
  const opponentAvatar = isWhite ? row.black_avatar : row.white_avatar;
  const opponentCountry = isWhite ? row.black_country : row.white_country;
  const opponentCountryCode = isWhite ? row.black_country_code : row.white_country_code;
  const myDisconnectedAt = isWhite ? row.white_disconnected_at : row.black_disconnected_at;
  const opponentDisconnectedAt = isWhite ? row.black_disconnected_at : row.white_disconnected_at;

  let winnerColor: 'white' | 'black' | null = null;
  if (row.winner_user_id) {
    winnerColor = row.winner_user_id === row.white_user_id ? 'white' : 'black';
  }

  const graceDeadline = opponentDisconnectedAt
    ? new Date(new Date(opponentDisconnectedAt).getTime() + DISCONNECT_GRACE_MS).toISOString()
    : null;

  return {
    id: row.id,
    roomName: row.room_name,
    boardSize: row.board_size as 8 | 12,
    boardTheme: row.board_theme,
    status: row.status,
    winnerUserId: row.winner_user_id,
    winnerColor,
    winnerReason: row.winner_reason,
    myColor,
    opponentId,
    opponentUsername,
    opponentAvatar,
    opponentCountry,
    opponentCountryCode,
    myDisconnectedAt: toIsoOrNull(myDisconnectedAt),
    opponentDisconnectedAt: toIsoOrNull(opponentDisconnectedAt),
    opponentDisconnectDeadlineAt: graceDeadline,
    createdAt: new Date(row.created_at).toISOString(),
    endedAt: toIsoOrNull(row.ended_at),
    stateRevision: row.state_revision,
    gameState: row.game_state,
  };
}

async function fetchMatchWithUsers(matchId: string): Promise<MatchRow | null> {
  const { rows } = await pool.query(
    `SELECT gm.*,\
            wu.username AS white_username, wu.avatar AS white_avatar, wu.country AS white_country, wu.country_code AS white_country_code,\
            bu.username AS black_username, bu.avatar AS black_avatar, bu.country AS black_country, bu.country_code AS black_country_code\
     FROM game_matches gm\
     JOIN users wu ON wu.id = gm.white_user_id\
     JOIN users bu ON bu.id = gm.black_user_id\
     WHERE gm.id = $1`,
    [matchId],
  );

  if (rows.length === 0) {
    return null;
  }

  return rows[0] as MatchRow;
}

async function applyTimeoutIfNeeded(match: MatchRow): Promise<MatchRow> {
  if (match.status !== 'active') {
    return match;
  }

  const now = Date.now();
  const whiteDisc = match.white_disconnected_at ? new Date(match.white_disconnected_at).getTime() : null;
  const blackDisc = match.black_disconnected_at ? new Date(match.black_disconnected_at).getTime() : null;

  let loserUserId: string | null = null;
  if (whiteDisc && now - whiteDisc >= DISCONNECT_GRACE_MS) {
    loserUserId = match.white_user_id;
  } else if (blackDisc && now - blackDisc >= DISCONNECT_GRACE_MS) {
    loserUserId = match.black_user_id;
  }

  if (!loserUserId) {
    return match;
  }

  const winnerUserId = loserUserId === match.white_user_id ? match.black_user_id : match.white_user_id;
  await pool.query(
    `UPDATE game_matches\
     SET status = 'finished',\
         winner_user_id = $1,\
         winner_reason = 'timeout',\
         ended_at = NOW(),\
         updated_at = NOW()\
     WHERE id = $2 AND status = 'active'`,
    [winnerUserId, match.id],
  );

  emitMatchMeta(match.id, {
    status: 'finished',
    winnerUserId,
    winnerReason: 'timeout',
  });

  const updated = await fetchMatchWithUsers(match.id);
  return updated ?? match;
}

async function getAndValidateMatchForUser(matchId: string, userId: string, res: Response): Promise<MatchRow | null> {
  const found = await fetchMatchWithUsers(matchId);
  if (!found) {
    res.status(404).json({ error: 'Match not found' });
    return null;
  }

  if (found.white_user_id !== userId && found.black_user_id !== userId) {
    res.status(403).json({ error: 'You are not part of this match' });
    return null;
  }

  return applyTimeoutIfNeeded(found);
}

// GET /api/matches/active — active matches for the user
router.get('/active', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT gm.id\
       FROM game_matches gm\
       WHERE gm.status = 'active'\
         AND (gm.white_user_id = $1 OR gm.black_user_id = $1)\
       ORDER BY gm.created_at DESC\
       LIMIT 50`,
      [req.userId],
    );

    if (rows.length === 0) {
      res.json({ matches: [], match: null });
      return;
    }

    const mappedMatches: ReturnType<typeof mapMatch>[] = [];
    for (const row of rows) {
      const match = await getAndValidateMatchForUser(row.id as string, req.userId!, res);
      if (!match) {
        return;
      }
      if (match.status === 'active') {
        mappedMatches.push(mapMatch(match, req.userId!));
      }
    }

    res.json({
      matches: mappedMatches,
      // Keep backward compatibility for existing clients
      match: mappedMatches[0] ?? null,
    });
  } catch (err) {
    console.error('Get active match error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/matches/:id — match details/status for participants
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const match = await getAndValidateMatchForUser(req.params.id, req.userId!, res);
    if (!match) {
      return;
    }

    res.json({ match: mapMatch(match, req.userId!) });
  } catch (err) {
    console.error('Get match error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/matches/:id/state — synchronized multiplayer state
router.get('/:id/state', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const match = await getAndValidateMatchForUser(req.params.id, req.userId!, res);
    if (!match) {
      return;
    }

    res.json({
      stateRevision: match.state_revision,
      gameState: match.game_state,
      status: match.status,
      winnerUserId: match.winner_user_id,
      winnerReason: match.winner_reason,
    });
  } catch (err) {
    console.error('Get match state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/matches/:id/state — update synchronized multiplayer state
router.put(
  '/:id/state',
  authenticate,
  [body('state').isObject(), body('expectedRevision').optional().isInt({ min: 0 })],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    try {
      const match = await getAndValidateMatchForUser(req.params.id, req.userId!, res);
      if (!match) {
        return;
      }

      if (match.status !== 'active') {
        res.status(409).json({ error: 'Match is not active' });
        return;
      }

      const { state, expectedRevision } = req.body as {
        state: Record<string, unknown>;
        expectedRevision?: number;
      };

      const effectiveExpectedRevision = typeof expectedRevision === 'number'
        ? expectedRevision
        : match.state_revision;

      const { rows } = await pool.query(
        `UPDATE game_matches
         SET game_state = $1::jsonb,
             state_revision = state_revision + 1,
             updated_at = NOW()
         WHERE id = $2 AND state_revision = $3
         RETURNING state_revision, game_state`,
        [JSON.stringify(state), match.id, effectiveExpectedRevision],
      );

      if (rows.length === 0) {
        const latest = await fetchMatchWithUsers(match.id);
        res.status(409).json({
          error: 'State out of sync',
          currentStateRevision: latest?.state_revision ?? match.state_revision,
          gameState: latest?.game_state ?? match.game_state,
        });
        return;
      }

      const nextRevision = rows[0].state_revision as number;
      await persistMoveHistoryDelta(
        match.id,
        (match.game_state as PersistedGameState | null) ?? null,
        state as PersistedGameState,
        nextRevision,
      );

      const persistedState = state as PersistedGameState;
      if (persistedState.gameOver === true) {
        const winnerColor = parseWinnerColor(persistedState);
        const winnerUserId = winnerColor === 'white'
          ? match.white_user_id
          : winnerColor === 'black'
            ? match.black_user_id
            : null;

        await pool.query(
          `UPDATE game_matches
           SET status = 'finished',
               winner_user_id = $1,
               winner_reason = 'completed',
               ended_at = NOW(),
               updated_at = NOW()
           WHERE id = $2 AND status = 'active'`,
          [winnerUserId, match.id],
        );

        emitMatchMeta(match.id, {
          status: 'finished',
          winnerUserId,
          winnerReason: 'completed',
        });
      }

      res.json({
        stateRevision: nextRevision,
        gameState: rows[0].game_state,
      });

      emitMatchState(match.id, {
        stateRevision: nextRevision,
        gameState: rows[0].game_state,
      });
    } catch (err) {
      console.error('Update match state error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/matches/:id/rejoin — clear disconnect marker for current user
router.post('/:id/rejoin', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const match = await getAndValidateMatchForUser(req.params.id, req.userId!, res);
    if (!match) {
      return;
    }

    if (match.status !== 'active') {
      res.status(409).json({ error: 'Match is not active' });
      return;
    }

    const isWhite = match.white_user_id === req.userId;
    await pool.query(
      `UPDATE game_matches\
       SET ${isWhite ? 'white_disconnected_at' : 'black_disconnected_at'} = NULL,\
           updated_at = NOW()\
       WHERE id = $1`,
      [match.id],
    );

    const refreshed = await fetchMatchWithUsers(match.id);
    if (!refreshed) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    res.json({ match: mapMatch(refreshed, req.userId!) });

    emitMatchMeta(match.id, {
      status: refreshed.status,
      winnerUserId: refreshed.winner_user_id,
      winnerReason: refreshed.winner_reason,
      whiteDisconnectedAt: refreshed.white_disconnected_at,
      blackDisconnectedAt: refreshed.black_disconnected_at,
    });
  } catch (err) {
    console.error('Rejoin match error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/matches/:id/disconnect — mark user disconnected and start grace timer
router.post('/:id/disconnect', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const match = await getAndValidateMatchForUser(req.params.id, req.userId!, res);
    if (!match) {
      return;
    }

    if (match.status !== 'active') {
      res.status(409).json({ error: 'Match is not active' });
      return;
    }

    const isWhite = match.white_user_id === req.userId;
    await pool.query(
      `UPDATE game_matches\
       SET ${isWhite ? 'white_disconnected_at' : 'black_disconnected_at'} = COALESCE(${isWhite ? 'white_disconnected_at' : 'black_disconnected_at'}, NOW()),\
           updated_at = NOW()\
       WHERE id = $1`,
      [match.id],
    );

    const refreshed = await fetchMatchWithUsers(match.id);
    if (!refreshed) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    res.json({ match: mapMatch(refreshed, req.userId!) });

    emitMatchMeta(match.id, {
      status: refreshed.status,
      winnerUserId: refreshed.winner_user_id,
      winnerReason: refreshed.winner_reason,
      whiteDisconnectedAt: refreshed.white_disconnected_at,
      blackDisconnectedAt: refreshed.black_disconnected_at,
    });
  } catch (err) {
    console.error('Disconnect match error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
