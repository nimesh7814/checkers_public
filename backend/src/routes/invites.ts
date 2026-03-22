import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { randomBytes } from 'crypto';

import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/authenticate';

const router = Router();

type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

const ROOM_ADJECTIVES = [
  'Brave',
  'Swift',
  'Golden',
  'Silent',
  'Crimson',
  'Arctic',
  'Emerald',
  'Shadow',
  'Thunder',
  'Iron',
  'Mighty',
  'Rapid',
];

const ROOM_ANIMALS = [
  'Falcon',
  'Tiger',
  'Panther',
  'Wolf',
  'Leopard',
  'Eagle',
  'Fox',
  'Lynx',
  'Jaguar',
  'Hawk',
  'Otter',
  'Stag',
  'Bison',
  'Puma',
  'Cobra',
  'Raven',
];

function normalizeRoomName(roomName: string): string {
  return roomName.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function randomRoomCandidate(): string {
  const adjective = ROOM_ADJECTIVES[Math.floor(Math.random() * ROOM_ADJECTIVES.length)];
  const animal = ROOM_ANIMALS[Math.floor(Math.random() * ROOM_ANIMALS.length)];
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  return `${adjective} ${animal} ${suffix}`;
}

async function roomNameExists(roomName: string): Promise<boolean> {
  const inviteResult = await pool.query(
    'SELECT 1 FROM game_invites WHERE LOWER(room_name) = LOWER($1) LIMIT 1',
    [roomName],
  );
  if (inviteResult.rows.length > 0) return true;

  const matchResult = await pool.query(
    'SELECT 1 FROM game_matches WHERE LOWER(room_name) = LOWER($1) LIMIT 1',
    [roomName],
  );
  return matchResult.rows.length > 0;
}

async function resolveRoomName(rawRoomName: string | undefined): Promise<string> {
  if (typeof rawRoomName === 'string' && rawRoomName.trim().length > 0) {
    const normalized = normalizeRoomName(rawRoomName);
    const exists = await roomNameExists(normalized);
    if (!exists) {
      return normalized;
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = randomRoomCandidate();
    const exists = await roomNameExists(candidate);
    if (!exists) {
      return candidate;
    }
  }

  return `Arena ${Date.now()}`;
}

function mapInvite(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    matchId: (row.match_id as string | null) ?? null,
    roomName: (row.room_name as string | null) ?? null,
    fromUserId: row.from_user_id as string,
    toUserId: row.to_user_id as string,
    boardSize: row.board_size as number,
    boardTheme: row.board_theme as string,
    inviterColor: row.inviter_color as 'white' | 'black',
    status: row.status as InviteStatus,
    createdAt: row.created_at as string,
    respondedAt: (row.responded_at as string | null) ?? null,
    fromUsername: row.from_username as string,
    fromAvatar: (row.from_avatar as string | null) ?? null,
    fromCountry: row.from_country as string,
    fromCountryCode: row.from_country_code as string,
    toUsername: row.to_username as string,
    toAvatar: (row.to_avatar as string | null) ?? null,
    toCountry: row.to_country as string,
    toCountryCode: row.to_country_code as string,
  };
}

// GET /api/invites — list incoming and outgoing invites for current user
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT gi.*,\
              fu.username AS from_username, fu.avatar AS from_avatar, fu.country AS from_country, fu.country_code AS from_country_code,\
              tu.username AS to_username, tu.avatar AS to_avatar, tu.country AS to_country, tu.country_code AS to_country_code\
       FROM game_invites gi\
       JOIN users fu ON fu.id = gi.from_user_id\
       JOIN users tu ON tu.id = gi.to_user_id\
       WHERE gi.from_user_id = $1 OR gi.to_user_id = $1\
       ORDER BY gi.created_at DESC\
       LIMIT 100`,
      [req.userId],
    );

    const invites = rows.map(mapInvite);
    res.json({
      incoming: invites.filter(invite => invite.toUserId === req.userId),
      outgoing: invites.filter(invite => invite.fromUserId === req.userId),
    });
  } catch (err) {
    console.error('Get invites error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/invites — create invite
router.post(
  '/',
  authenticate,
  [
    body('toUserId').isUUID(),
    body('roomName')
      .customSanitizer(value => (typeof value === 'string' && value.trim().length === 0 ? undefined : value))
      .optional()
      .isString()
      .trim()
      .isLength({ min: 3, max: 80 }),
    body('boardSize').isIn([8, 12]),
    body('boardTheme').isIn(['classic', 'wooden', 'metal']),
    body('inviterColor').isIn(['white', 'black']),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { toUserId, roomName, boardSize, boardTheme, inviterColor } = req.body as {
      toUserId: string;
      roomName?: string;
      boardSize: 8 | 12;
      boardTheme: 'classic' | 'wooden' | 'metal';
      inviterColor: 'white' | 'black';
    };

    if (toUserId === req.userId) {
      res.status(400).json({ error: 'You cannot invite yourself' });
      return;
    }

    try {
      const target = await pool.query('SELECT id FROM users WHERE id = $1', [toUserId]);
      if (target.rows.length === 0) {
        res.status(404).json({ error: 'Opponent not found' });
        return;
      }

      await pool.query(
        `UPDATE game_invites\
         SET status = 'cancelled', responded_at = NOW()\
         WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`,
        [req.userId, toUserId],
      );

      const resolvedRoomName = await resolveRoomName(roomName);

      const { rows } = await pool.query(
        `INSERT INTO game_invites (from_user_id, to_user_id, room_name, board_size, board_theme, inviter_color)\
         VALUES ($1, $2, $3, $4, $5, $6)\
         RETURNING *`,
        [req.userId, toUserId, resolvedRoomName, boardSize, boardTheme, inviterColor],
      );

      const inviteId = rows[0].id as string;
      const detail = await pool.query(
        `SELECT gi.*,\
                fu.username AS from_username, fu.avatar AS from_avatar, fu.country AS from_country, fu.country_code AS from_country_code,\
                tu.username AS to_username, tu.avatar AS to_avatar, tu.country AS to_country, tu.country_code AS to_country_code\
         FROM game_invites gi\
         JOIN users fu ON fu.id = gi.from_user_id\
         JOIN users tu ON tu.id = gi.to_user_id\
         WHERE gi.id = $1`,
        [inviteId],
      );

      res.status(201).json({ invite: mapInvite(detail.rows[0]) });
    } catch (err) {
      console.error('Create invite error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/invites/:id — accept/decline/cancel invite
router.patch(
  '/:id',
  authenticate,
  [body('status').isIn(['accepted', 'declined', 'cancelled'])],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { id } = req.params;
    const { status } = req.body as { status: InviteStatus };

    try {
      const existing = await pool.query('SELECT * FROM game_invites WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Invite not found' });
        return;
      }

      const invite = existing.rows[0] as Record<string, unknown>;
      if ((invite.status as InviteStatus) !== 'pending') {
        res.status(409).json({ error: 'Invite is no longer pending' });
        return;
      }

      const fromUserId = invite.from_user_id as string;
      const toUserId = invite.to_user_id as string;

      if ((status === 'accepted' || status === 'declined') && toUserId !== req.userId) {
        res.status(403).json({ error: 'Only invited player can accept or decline' });
        return;
      }

      if (status === 'cancelled' && fromUserId !== req.userId) {
        res.status(403).json({ error: 'Only inviter can cancel' });
        return;
      }

      let updatedInviteId: string;

      if (status === 'accepted') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const lockedInviteResult = await client.query('SELECT * FROM game_invites WHERE id = $1 FOR UPDATE', [id]);
          if (lockedInviteResult.rows.length === 0) {
            await client.query('ROLLBACK');
            res.status(404).json({ error: 'Invite not found' });
            return;
          }

          const lockedInvite = lockedInviteResult.rows[0] as Record<string, unknown>;
          if ((lockedInvite.status as InviteStatus) !== 'pending') {
            await client.query('ROLLBACK');
            res.status(409).json({ error: 'Invite is no longer pending' });
            return;
          }

          const lockedFromUserId = lockedInvite.from_user_id as string;
          const lockedToUserId = lockedInvite.to_user_id as string;
          const inviterColor = lockedInvite.inviter_color as 'white' | 'black';
          const whiteUserId = inviterColor === 'white' ? lockedFromUserId : lockedToUserId;
          const blackUserId = inviterColor === 'white' ? lockedToUserId : lockedFromUserId;

          const matchInsert = await client.query(
            `INSERT INTO game_matches (invite_id, white_user_id, black_user_id, room_name, board_size, board_theme)\
             VALUES ($1, $2, $3, $4, $5, $6)\
             RETURNING id`,
            [
              id,
              whiteUserId,
              blackUserId,
              (lockedInvite.room_name as string | null) ?? null,
              lockedInvite.board_size as number,
              lockedInvite.board_theme as string,
            ],
          );

          const createdMatchId = matchInsert.rows[0].id as string;

          const inviteUpdate = await client.query(
            `UPDATE game_invites\
             SET status = 'accepted', responded_at = NOW(), match_id = $1\
             WHERE id = $2\
             RETURNING id`,
            [createdMatchId, id],
          );
          updatedInviteId = inviteUpdate.rows[0].id as string;

          await client.query('COMMIT');
        } catch (txnErr) {
          await client.query('ROLLBACK');
          throw txnErr;
        } finally {
          client.release();
        }
      } else {
        const { rows } = await pool.query(
          `UPDATE game_invites\
           SET status = $1, responded_at = NOW()\
           WHERE id = $2\
           RETURNING *`,
          [status, id],
        );
        updatedInviteId = rows[0].id as string;
      }

      const detail = await pool.query(
        `SELECT gi.*,\
                fu.username AS from_username, fu.avatar AS from_avatar, fu.country AS from_country, fu.country_code AS from_country_code,\
                tu.username AS to_username, tu.avatar AS to_avatar, tu.country AS to_country, tu.country_code AS to_country_code\
         FROM game_invites gi\
         JOIN users fu ON fu.id = gi.from_user_id\
         JOIN users tu ON tu.id = gi.to_user_id\
         WHERE gi.id = $1`,
        [updatedInviteId],
      );

      res.json({ invite: mapInvite(detail.rows[0]) });
    } catch (err) {
      console.error('Update invite error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
