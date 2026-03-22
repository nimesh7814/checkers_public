import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { userRow } from '../utils/userRow';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const TOKEN_TTL = '7d';
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AvailabilityResult = {
  available: boolean;
  message: string;
};

function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (trimmed.length < 4 || trimmed.length > 50) {
    return 'Username must be 4-50 characters long';
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Username can contain only letters, numbers, and underscores';
  }
  return null;
}

function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!EMAIL_PATTERN.test(trimmed)) {
    return 'Enter a valid email address';
  }
  return null;
}

async function getAvailability(username?: string, email?: string): Promise<{
  username?: AvailabilityResult;
  email?: AvailabilityResult;
}> {
  const response: {
    username?: AvailabilityResult;
    email?: AvailabilityResult;
  } = {};

  const trimmedUsername = typeof username === 'string' ? username.trim() : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const checks: Array<Promise<void>> = [];

  if (trimmedUsername) {
    const usernameError = validateUsername(trimmedUsername);
    if (usernameError) {
      response.username = { available: false, message: usernameError };
    } else {
      checks.push(
        pool
          .query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [trimmedUsername])
          .then(({ rows }) => {
            response.username = rows.length === 0
              ? { available: true, message: 'Username is available' }
              : { available: false, message: 'Username is already taken' };
          }),
      );
    }
  }

  if (normalizedEmail) {
    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      response.email = { available: false, message: emailError };
    } else {
      checks.push(
        pool
          .query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [normalizedEmail])
          .then(({ rows }) => {
            response.email = rows.length === 0
              ? { available: true, message: 'Email address is available' }
              : { available: false, message: 'Email address is already registered' };
          }),
      );
    }
  }

  await Promise.all(checks);
  return response;
}

function sendUniqueFieldError(res: Response, field: 'username' | 'email', message: string): void {
  res.status(409).json({ error: message, field });
}

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}

router.get('/availability', async (req: Request, res: Response): Promise<void> => {
  const username = typeof req.query.username === 'string' ? req.query.username : undefined;
  const email = typeof req.query.email === 'string' ? req.query.email : undefined;

  if (!username && !email) {
    res.status(400).json({ error: 'username or email query parameter is required' });
    return;
  }

  try {
    const availability = await getAvailability(username, email);
    res.json(availability);
  } catch (err) {
    console.error('Availability error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 4, max: 50 })
      .withMessage('Username must be 4-50 characters long')
      .matches(USERNAME_PATTERN)
      .withMessage('Username can contain only letters, numbers, and underscores'),
    body('email').isEmail().withMessage('Enter a valid email address').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { username, email, password, firstName, lastName, birthday, country, countryCode, avatar } = req.body;
    const trimmedUsername = String(username).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    try {
      const availability = await getAvailability(trimmedUsername, normalizedEmail);
      if (availability.username && !availability.username.available) {
        sendUniqueFieldError(res, 'username', availability.username.message);
        return;
      }
      if (availability.email && !availability.email.available) {
        sendUniqueFieldError(res, 'email', availability.email.message);
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const { rows } = await pool.query(
        `INSERT INTO users
           (username, email, password_hash, first_name, last_name, birthday, country, country_code, avatar, is_online)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         RETURNING *`,
        [
          trimmedUsername, normalizedEmail, passwordHash,
          firstName, lastName,
          birthday || null, country, countryCode,
          avatar || null,
        ],
      );

      const token = jwt.sign({ userId: rows[0].id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
      await pool.query('INSERT INTO sessions (user_id, token) VALUES ($1, $2)', [rows[0].id, token]);

      res.status(201).json({ token, user: userRow(rows[0]) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        if (err.constraint === 'users_username_key') {
          sendUniqueFieldError(res, 'username', 'Username is already taken');
          return;
        }
        if (err.constraint === 'users_email_key') {
          sendUniqueFieldError(res, 'email', 'Email address is already registered');
          return;
        }
        res.status(409).json({ error: 'Username or email is already in use' });
        return;
      }

      console.error('Register error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }

    const { username, password } = req.body;

    try {
      const { rows } = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
        [username],
      );
      if (rows.length === 0) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      const valid = await bcrypt.compare(password, rows[0].password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      // Mark online and create session
      await pool.query('UPDATE users SET is_online = true WHERE id = $1', [rows[0].id]);
      const token = jwt.sign({ userId: rows[0].id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
      await pool.query('INSERT INTO sessions (user_id, token) VALUES ($1, $2)', [rows[0].id, token]);

      res.json({ token, user: userRow({ ...rows[0], is_online: true }) });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const token = req.headers.authorization!.slice(7);
  try {
    await pool.query(
      'UPDATE sessions SET is_active = false, logged_out_at = NOW() WHERE token = $1',
      [token],
    );
    await pool.query('UPDATE users SET is_online = false WHERE id = $1', [req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: userRow(rows[0]) });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
