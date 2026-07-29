# Slotcare AI — Appointment Booking System

Smart appointment booking platform with AI assistant, multi-company support, and real-time availability.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS
- **Backend:** Node.js + Express + TypeScript + Prisma ORM
- **Database:** PostgreSQL 16
- **AI:** Groq API (LLM-powered chat assistant)
- **Process Manager:** PM2

## Quick Start (Local Development)

```bash
# Install dependencies
cd apps/backend && npm install
cd ../web && npm install

# Set up environment
cp apps/backend/.env.example apps/backend/.env

# Start PostgreSQL and create database
createdb slotcare

# Run migrations and seed
cd apps/backend
npx prisma db push
npx ts-node prisma/seed.ts

# Start backend (port 4000)
npm run dev

# Start frontend (port 5173)
cd ../web && npm run dev
```

## Production Deployment

See [deploy/deploy.sh](deploy/deploy.sh) for manual deployment instructions.

### CI/CD Pipeline

This repo includes GitHub Actions workflows:

1. **CI** (`.github/workflows/ci.yml`) — Runs on every push/PR to `main`:
   - Installs dependencies
   - Builds backend & frontend
   - Runs tests
   - Uploads build artifacts

2. **CD** (`.github/workflows/deploy.yml`) — Runs on push to `main`:
   - Builds production artifacts
   - SCPs to server
   - Applies migrations
   - Restarts PM2

### Required GitHub Secrets for CD

| Secret | Description |
|--------|-------------|
| `DEPLOY_SERVER_IP` | Server IP address |
| `DEPLOY_SERVER_USER` | SSH username (root) |
| `DEPLOY_SERVER_PASSWORD` | SSH password |

## Project Structure

```
oppoint_booking/
├── apps/
│   ├── backend/          # Express API server
│   │   ├── src/          # TypeScript source
│   │   ├── dist/         # Compiled JS (gitignored)
│   │   ├── prisma/       # Database schema & migrations
│   │   └── package.json
│   └── web/              # React frontend
│       ├── src/          # TypeScript source
│       ├── dist/         # Built static files (gitignored)
│       └── package.json
├── deploy/               # Deployment scripts & configs
│   ├── build.sh          # Build both apps
│   ├── deploy.sh         # Manual deployment guide
│   ├── ecosystem.config.js  # PM2 config
│   └── nginx.conf        # Nginx reverse proxy config
├── .github/workflows/    # CI/CD pipelines
└── package.json          # Root workspace config
```

## API Routes

### Auth
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Register (company owner, pending approval)

### Admin (requires auth)
- `GET/POST/PUT /api/companies` — Company CRUD
- `GET/POST /api/centres` — Centre CRUD
- `GET/POST /api/staff` — Staff CRUD
- `GET/POST /api/services` — Service CRUD
- `GET /api/bookings` — View bookings
- `GET /api/availability` — Check availability
- `GET /api/dashboard/stats` — Dashboard statistics
- `PATCH /api/users/:id/approve` — Approve user (superadmin only)

### Public (no auth)
- `GET /public/companies` — List companies
- `GET /public/centres` — List centres by company
- `GET /public/services` — List services by centre
- `GET /public/availability` — Check open slots
- `POST /public/bookings` — Create booking
- `POST /public/bookings/:ref/cancel` — Cancel booking
- `POST /public/chat` — AI chat assistant

## License

Private — Adelphos Tech
