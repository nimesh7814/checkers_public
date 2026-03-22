# Checkers Arena

Multiplayer and AI checkers game with React frontend, Node/Express backend, PostgreSQL, Docker support, invitations, resumable matches, and realtime sync.

## Features

- Multiplayer invites with accept and decline flow
- Realtime match synchronization between players
- Resume active matches from dashboard
- Disconnect grace period with timeout win handling
- Registration blocks duplicate usernames and email addresses, with live availability hints
- AI mode with difficulty levels
- 8x8 and 12x12 board support
- Multiple board themes
- Profile, leaderboard, match history, and achievements pages
- JWT authentication and persistent user data in PostgreSQL

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind, shadcn/ui
- Backend: Node.js, Express, TypeScript, PostgreSQL
- Realtime: Socket.IO
- Infra: Docker Compose, Nginx
- Tests: Vitest

## Quick Start (Docker)

### 1. Prepare environment

Copy [.env.example](.env.example) to `.env`:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

If you expose `http://localhost:8036` through Cloudflare Tunnel or another reverse proxy, add the public HTTPS hostname to `CORS_ORIGIN` in `.env`.

Examples:

```env
CORS_ORIGIN=http://localhost:8036,https://ck.akalanka.me
```

```env
CORS_ORIGIN=http://localhost:8036,https://*.trycloudflare.com
```

Rules:

- Keep `http://localhost:8036` if you still want local access.
- Add every public hostname that serves the frontend.
- Use comma-separated values with no spaces.
- Rebuild or restart the backend after editing `.env`.

### 2. Build and run

```bash
docker compose up -d --build
```

Docker Compose automatically reads variables from `.env` in the project root.

### 3. Open app

- Frontend: http://localhost:8036
- Backend health: http://localhost:8036/api/health

## Local Development (without Docker)

### Requirements

- Node.js 20+
- npm
- PostgreSQL 16+

### 1. Frontend setup

From repository root:

```bash
npm install
npm run dev
```

### 2. Backend setup

In a second terminal:

```bash
cd backend
npm install
npm run dev
```

### 3. Environment variables

Use values from [.env.example](.env.example) for both root and backend runtime as needed.

## Environment Parameters

These variables are consumed by [docker-compose.yml](docker-compose.yml):

| Variable | Used by | Purpose |
| --- | --- | --- |
| `POSTGRES_DB` | `db` | PostgreSQL database name |
| `POSTGRES_USER` | `db` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `db` | PostgreSQL password |
| `DB_HOST` | `backend` | Database host for backend |
| `DB_PORT` | `backend` | Database port |
| `DB_NAME` | `backend` | Database name for backend connection |
| `DB_USER` | `backend` | Database username for backend connection |
| `DB_PASSWORD` | `backend` | Database password for backend connection |
| `JWT_SECRET` | `backend` | JWT signing secret |
| `PORT` | `backend` | Backend listen port inside container |
| `CORS_ORIGIN` | `backend` | Allowed frontend origin(s); comma-separated, wildcard hosts supported |

Notes:

- If your `JWT_SECRET` contains a dollar sign, escape it in `.env` as `$$` so Docker Compose keeps it literal.
- `VITE_API_URL` is included for frontend configuration and defaults to `/api` in Docker builds.
- `CORS_ORIGIN` accepts exact origins and wildcard hosts such as `http://localhost:8036,https://*.trycloudflare.com`.
- For a custom tunnel domain, add the exact public hostname, for example `https://ck.akalanka.me`.
- Do not commit your real `.env` to git. Keep real credentials only in local `.env` and/or secret manager.

## Registration Rules

- Username must be at least 4 characters long.
- Username may contain only letters, numbers, and underscores.
- Username and email address must both be unique.
- The registration form checks username and email availability live before account creation.
- The backend still enforces uniqueness during registration, so duplicate accounts are rejected even if two requests race.

## Demo Accounts

If these values are set in `.env`, the backend auto-creates (or updates) demo users on startup:

- Username: `player_one` / Password: `PlayerOne123!`
- Username: `player_two` / Password: `PlayerTwo123!`

To apply changes, restart backend services:

```bash
docker compose up -d --build
```

You can then test invite, realtime sync, resume, and timeout flow quickly across two browser sessions.

## Testing

Run all frontend tests:

```bash
npm test
```

Run checkers rules tests only:

```bash
npm test -- --run src/test/checkers.test.ts
```

Build backend TypeScript:

```bash
cd backend
npm run build
```

## Project Structure

- [src](src): Frontend application
- [backend/src](backend/src): Backend API and database logic
- [docker-compose.yml](docker-compose.yml): Full stack orchestration
- [nginx.conf](nginx.conf): Frontend and API/websocket proxy

## Troubleshooting

- If backend cannot connect to PostgreSQL, reset local Docker volumes:

```bash
docker compose down -v
docker compose up -d --build
```

- If multiplayer state looks stale, hard refresh both browser tabs to ensure latest client bundle is loaded.

## License

See [LICENSE](LICENSE).
