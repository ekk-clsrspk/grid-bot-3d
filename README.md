# Grid Bot 3D

Static gameplay frontend plus a Rust/SQLite API for accounts, authentication, progress, score submissions, and administration.

## Backend

```sh
cd backend
cp .env.example .env
# Set a strong ADMIN_PASSWORD and the deployment values.
cargo run --release
```

The server creates the SQLite database and the environment-managed admin account on startup. The admin username, email, and password are synchronized from `.env`; the admin account cannot be edited or deleted through the dashboard.

Important environment variables:

- `HOST` and `PORT`: listener configuration.
- `DATABASE_URL`: server-side SQLite file, for example `sqlite://data/grid-bot.sqlite`.
- `SESSION_TTL_HOURS`: bearer session lifetime.
- `CORS_ALLOWED_ORIGINS`: comma-separated frontend origins allowed to call the API.
- `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: initial and authoritative admin credentials.

The frontend calls `https://0v0qtl4n8v.aek-lab.space`. TLS and hostname routing should terminate in front of the Rust listener. CORS is restricted to the configured frontend origin list.

## Frontend routes

The static host should provide:

- `/` → `frontend/index.html`
- `/playgame` → `frontend/playgame.html`
- `/admin` → `frontend/admin.html`

Admins logging in are redirected only to `/admin`. Player accounts are rejected from admin endpoints, and admin accounts are rejected from gameplay progress and submission endpoints.

## Main API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET|DELETE /api/progress`
- `POST /api/submissions`
- `GET /api/admin/overview`
- `GET|POST /api/admin/users`
- `PATCH|DELETE /api/admin/users/{id}`
- `GET /api/admin/submissions`

Submitted code is parsed and simulated server-side. Only routes that reach the configured mission goal without leaving the board or hitting an obstacle are stored.
