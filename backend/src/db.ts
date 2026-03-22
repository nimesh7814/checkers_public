
import { Pool } from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

let poolConfig;
if (process.env.NODE_ENV === 'production') {
  poolConfig = {
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    // channelBinding removed: not a valid PoolConfig property
  };
} else if (process.env.NEON_DB_URL) {
  poolConfig = { connectionString: process.env.NEON_DB_URL };
} else {
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'checkers',
    user: process.env.DB_USER || 'checkers',
    password: process.env.DB_PASSWORD || 'checkers_password',
  };
}

export const pool = new Pool(poolConfig);

function inferCountryCode(countryName: string): string | null {
  const normalized = countryName.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        const name = regionNames.of(code);
        if (typeof name === 'string' && name.trim().toLowerCase() === normalized) {
          return code;
        }
      }
    }
  } catch {
    // Ignore Intl availability issues and fall back to null.
  }

  return null;
}

async function seedDemoUsers(): Promise<void> {
  type DemoUserSeed = {
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    email: string;
    birthday: string | null;
    country: string | null;
    countryCode: string | null;
  };

  const normalizeRequired = (value: string | undefined): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const makeCandidate = (index: 1 | 2): DemoUserSeed | null => {
    const username = normalizeRequired(process.env[`DEMO_USER_${index}_USERNAME`]);
    const password = normalizeRequired(process.env[`DEMO_USER_${index}_PASSWORD`]);
    const firstName = normalizeRequired(process.env[`DEMO_USER_${index}_FIRST_NAME`]);
    const lastName = normalizeRequired(process.env[`DEMO_USER_${index}_LAST_NAME`]);
    const email = normalizeRequired(process.env[`DEMO_USER_${index}_EMAIL`]);
    const birthday = normalizeRequired(process.env[`DEMO_USER_${index}_BIRTHDAY`]);
    const country = normalizeRequired(process.env[`DEMO_USER_${index}_COUNTRY`]);

    if (!username || !password || !firstName || !lastName || !email || !birthday || !country) {
      return null;
    }

    const countryCode = inferCountryCode(country);

    return { username, password, firstName, lastName, email, birthday, country, countryCode };
  };

  const candidates = [
    makeCandidate(1),
    makeCandidate(2),
  ].filter((user): user is DemoUserSeed => user !== null);

  for (const user of candidates) {
    const passwordHash = await bcrypt.hash(user.password, 12);

    await pool.query(
      `INSERT INTO users
         (username, email, password_hash, first_name, last_name, birthday, country, country_code, is_online)
       VALUES
         ($1, $2, $3, $4, $5, $6::date, $7, $8, false)
       ON CONFLICT (username) DO UPDATE
       SET email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           birthday = EXCLUDED.birthday,
           country = EXCLUDED.country,
           country_code = EXCLUDED.country_code`,
      [
        user.username,
        user.email,
        passwordHash,
        user.firstName,
        user.lastName,
        user.birthday,
        user.country,
        user.countryCode,
      ],
    );
  }
}

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username      VARCHAR(50)  UNIQUE NOT NULL,
      email         VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name    VARCHAR(100) NOT NULL,
      last_name     VARCHAR(100) NOT NULL,
      birthday      DATE,
      avatar        TEXT,
      country       VARCHAR(100),
      country_code  VARCHAR(10),
      games_played  INTEGER DEFAULT 0,
      wins          INTEGER DEFAULT 0,
      losses        INTEGER DEFAULT 0,
      draws         INTEGER DEFAULT 0,
      board_theme         VARCHAR(20)  DEFAULT 'classic',
      checker_color       VARCHAR(10)  DEFAULT 'white',
      sound_enabled       BOOLEAN      DEFAULT true,
      animations_enabled  BOOLEAN      DEFAULT true,
      is_online     BOOLEAN DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token         TEXT UNIQUE NOT NULL,
      logged_in_at  TIMESTAMPTZ DEFAULT NOW(),
      logged_out_at TIMESTAMPTZ,
      is_active     BOOLEAN DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS game_invites (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_name      VARCHAR(80),
      board_size     INTEGER NOT NULL,
      board_theme    VARCHAR(20) NOT NULL,
      inviter_color  VARCHAR(10) NOT NULL,
      status         VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at   TIMESTAMPTZ,
      CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
      CHECK (inviter_color IN ('white', 'black')),
      CHECK (board_size IN (8, 12)),
      CHECK (from_user_id <> to_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_game_invites_to_status
      ON game_invites(to_user_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_game_invites_from_status
      ON game_invites(from_user_id, status, created_at DESC);

    ALTER TABLE game_invites
      ADD COLUMN IF NOT EXISTS match_id UUID;

    ALTER TABLE game_invites
      ADD COLUMN IF NOT EXISTS room_name VARCHAR(80);

    CREATE TABLE IF NOT EXISTS game_matches (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invite_id             UUID UNIQUE REFERENCES game_invites(id) ON DELETE SET NULL,
      white_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      black_user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_name             VARCHAR(80),
      board_size            INTEGER NOT NULL,
      board_theme           VARCHAR(20) NOT NULL,
      status                VARCHAR(20) NOT NULL DEFAULT 'active',
      winner_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
      winner_reason         VARCHAR(20),
      white_disconnected_at TIMESTAMPTZ,
      black_disconnected_at TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at              TIMESTAMPTZ,
      CHECK (white_user_id <> black_user_id),
      CHECK (board_size IN (8, 12)),
      CHECK (board_theme IN ('classic', 'wooden', 'metal')),
      CHECK (status IN ('active', 'finished', 'cancelled')),
      CHECK (winner_reason IS NULL OR winner_reason IN ('timeout', 'resign', 'completed'))
    );

    ALTER TABLE game_matches
      ADD COLUMN IF NOT EXISTS game_state JSONB;

    ALTER TABLE game_matches
      ADD COLUMN IF NOT EXISTS state_revision INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE game_matches
      ADD COLUMN IF NOT EXISTS room_name VARCHAR(80);

    CREATE INDEX IF NOT EXISTS idx_game_matches_active_by_white
      ON game_matches(white_user_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_game_matches_active_by_black
      ON game_matches(black_user_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS game_match_moves (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id              UUID NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
      move_index            INTEGER NOT NULL,
      move_notation         TEXT NOT NULL,
      mover_color           VARCHAR(10),
      elapsed_white_seconds INTEGER,
      elapsed_black_seconds INTEGER,
      state_revision        INTEGER NOT NULL,
      payload               JSONB,
      moved_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (match_id, move_index),
      CHECK (mover_color IS NULL OR mover_color IN ('white', 'black'))
    );

    CREATE INDEX IF NOT EXISTS idx_game_match_moves_match_id
      ON game_match_moves(match_id, move_index);
  `);

  await seedDemoUsers();
}
