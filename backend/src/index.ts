import express, { type Request } from 'express';
import cors, { type CorsOptionsDelegate } from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { initDb } from './db';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import invitesRouter from './routes/invites';
import matchesRouter from './routes/matches';
import { pool } from './db';
import { setRealtimeServer } from './realtime';

dotenv.config();

const app = express();

// Debug endpoint to list users directly from the database
app.get('/debug/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, first_name, last_name FROM users ORDER BY created_at DESC LIMIT 20');
    res.json(result.rows);
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Unknown error' });
    }
  }
});
const PORT = parseInt(process.env.PORT || '3001', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

type AllowedOriginRule = {
  any: boolean;
  exactOrigin?: string;
  protocol?: string;
  hostSuffix?: string;
};

function normalizeListValue(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function buildAllowedOriginRule(value: string): AllowedOriginRule | null {
  const normalized = normalizeListValue(value);
  if (!normalized) return null;
  if (normalized === '*') return { any: true };

  const wildcardMatch = normalized.match(/^(https?):\/\/\*\.(.+)$/i);
  if (wildcardMatch) {
    return {
      any: false,
      protocol: `${wildcardMatch[1].toLowerCase()}:`,
      hostSuffix: `.${wildcardMatch[2].toLowerCase()}`,
    };
  }

  const hostnameWildcard = normalized.match(/^\*\.(.+)$/i);
  if (hostnameWildcard) {
    return {
      any: false,
      hostSuffix: `.${hostnameWildcard[1].toLowerCase()}`,
    };
  }

  try {
    return { any: false, exactOrigin: new URL(normalized).origin.toLowerCase() };
  } catch {
    return { any: false, exactOrigin: normalized.toLowerCase() };
  }
}

function extractRequestHosts(...values: Array<string | string[] | undefined>): Set<string> {
  const hosts = new Set<string>();

  for (const value of values) {
    const parts = Array.isArray(value) ? value : [value];
    for (const part of parts) {
      if (!part) continue;
      for (const host of part.split(',')) {
        const normalized = host.trim().toLowerCase();
        if (normalized) hosts.add(normalized);
      }
    }
  }

  return hosts;
}

const allowedOriginRules = (process.env.CORS_ORIGIN || 'http://localhost:8036')
  .split(',')
  .map(buildAllowedOriginRule)
  .filter((rule): rule is AllowedOriginRule => rule !== null);

function matchesAllowedOrigin(origin: URL): boolean {
  const normalizedOrigin = origin.origin.toLowerCase();
  const protocol = origin.protocol.toLowerCase();
  const host = origin.host.toLowerCase();

  return allowedOriginRules.some(rule => {
    if (rule.any) return true;
    if (rule.exactOrigin && rule.exactOrigin === normalizedOrigin) return true;
    if (!rule.hostSuffix) return false;
    if (rule.protocol && rule.protocol !== protocol) return false;
    return host.endsWith(rule.hostSuffix);
  });
}

function isOriginAllowed(origin: string | undefined, requestHosts?: Set<string>): boolean {
  if (!origin) return true;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (requestHosts?.has(parsedOrigin.host.toLowerCase())) {
    return true;
  }

  return matchesAllowedOrigin(parsedOrigin);
}

const corsOptionsDelegate: CorsOptionsDelegate<Request> = (req, cb) => {
  cb(null, {
    origin: isOriginAllowed(
      req.header('origin') ?? undefined,
      extractRequestHosts(req.header('x-forwarded-host') ?? undefined, req.header('host') ?? undefined),
    ),
    credentials: true,
  });
};

app.use(cors(corsOptionsDelegate));

// 10 MB body limit to support base64 profile pictures
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',  authRouter);
app.use('/api/users', usersRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/matches', matchesRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

initDb()
  .then(() => {
    const server = http.createServer(app);
    const io = new SocketIOServer(server, {
      path: '/socket.io',
      cors: {
        origin: (origin, cb) => cb(null, isOriginAllowed(origin ?? undefined)),
        credentials: true,
      },
      allowRequest: (req, cb) => {
        cb(
          null,
          isOriginAllowed(
            typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
            extractRequestHosts(req.headers['x-forwarded-host'], req.headers.host),
          ),
        );
      },
    });

    setRealtimeServer(io);

    io.use(async (socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }

      try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
        const { rows } = await pool.query(
          'SELECT id FROM sessions WHERE token = $1 AND is_active = true',
          [token],
        );
        if (rows.length === 0) {
          next(new Error('Session expired'));
          return;
        }

        socket.data.userId = payload.userId;
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });

    io.on('connection', socket => {
      socket.on('join_match', async (matchId: string) => {
        if (!matchId) return;

        try {
          const userId = socket.data.userId as string | undefined;
          if (!userId) return;

          const { rows } = await pool.query(
            `SELECT id
             FROM game_matches
             WHERE id = $1
               AND (white_user_id = $2 OR black_user_id = $2)`,
            [matchId, userId],
          );
          if (rows.length === 0) {
            return;
          }

          await socket.join(`match:${matchId}`);
        } catch {
          // Ignore room join failures; HTTP APIs remain fallback.
        }
      });

      socket.on('leave_match', async (matchId: string) => {
        if (!matchId) return;
        await socket.leave(`match:${matchId}`);
      });
    });

    server.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
