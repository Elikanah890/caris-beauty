# Caris Beauty POS

Offline-first point of sale, stock and staff management for a beauty shop.

- **Frontend:** Next.js 14, Tailwind, PWA (installable, offline app shell)
- **Backend:** Express + TypeScript, PostgreSQL
- **Offline:** IndexedDB cache + background sync queue
- **Auth:** owner/employee roles, server-enforced permissions, device binding, offline PIN

## Project structure

```
backend/    Express API, PostgreSQL migrations, tests
frontend/   Next.js PWA
render.yaml Render blueprint (API + PostgreSQL)
DEPLOYMENT.md  Render + Vercel deployment guide
```

## Local development

### 1. Database

Create a PostgreSQL database, then:

```bash
cd backend
cp .env.example .env
# Edit .env: DATABASE_URL, JWT secrets, CORS_ORIGIN
npm ci
npm run migrate
npm run dev
```

The API runs on `http://127.0.0.1:4000`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
npm ci
npm run dev
```

Open `http://localhost:3000`.

On a brand-new database, open **`/auth/setup`** to create the shop and owner account.

## Tests and builds

```bash
cd backend && npm test && npm run build
cd frontend && npm test && npm run lint && npm run build
```

## Deployment

- Backend + PostgreSQL: **VPS** (recommended) or **Render** (`render.yaml`)
- Managed PostgreSQL: **Neon** (SSL enabled automatically)
- Frontend PWA: **Vercel** or served by Nginx on the VPS

Full instructions, environment variables, the Neon setup and the cross-site
cookie setup are in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Security notes

- Never commit `.env` files. Only `.env.example` is tracked.
- Production requires HTTPS (PWA, service worker and secure cookies).
- Set `COOKIE_SECURE=true` and `CORS_ORIGIN=https://your-frontend-domain`.
