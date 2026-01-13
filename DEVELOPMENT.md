# Development Guide

This guide explains how to set up and run PFS Automation in development mode.

## Quick Start

```bash
# Install dependencies and start everything
pnpm install
pnpm run dev
```

The browser will automatically open at http://localhost:3000

## What Happens When You Run `pnpm run dev`

1. **Docker Infrastructure** starts (PostgreSQL + Redis)
2. **Backend** installs dependencies, runs migrations, starts on port 3333
3. **Frontend** installs dependencies, starts on port 3000, opens browser
4. **MCP Server** installs dependencies, starts on port 3334
5. **Scheduler** installs dependencies, starts

All services run in **watch mode** with hot-reload enabled.

## Project Structure

```
PFS-Automation/
├── package.json              # Root package with dev scripts
├── scripts/
│   └── setup-env.js         # Auto-generates .env files
├── backend/                  # AdonisJS API
│   ├── package.json
│   ├── app/
│   ├── database/
│   └── .env
├── frontend/                 # Next.js app
│   ├── package.json
│   ├── src/
│   └── .env
├── mcp-server/              # MCP protocol server
│   ├── package.json
│   └── src/
└── scheduler/               # Background tasks
    ├── package.json
    └── src/
```

## Available Commands

### Root Level Commands

```bash
# Development
pnpm run dev              # Start all services in dev mode
./dev.sh                  # Alternative way to start dev mode

# Setup
pnpm run setup:env        # Generate all .env files
pnpm run install:all      # Install deps for all services

# Build
pnpm run build            # Build all services for production

# Docker
pnpm run docker:up        # Start all in Docker
pnpm run docker:down      # Stop Docker services
pnpm run docker:logs      # View logs
pnpm run docker:clean     # Remove all containers and volumes

# Clean
pnpm run clean            # Remove all node_modules and Docker data
```

### Service-Specific Commands

**Backend:**
```bash
cd backend
pnpm run dev              # Start with hot-reload
pnpm run build            # Build for production
pnpm run start            # Start production build
pnpm run migration:run    # Run migrations
pnpm run migration:rollback  # Rollback migrations
pnpm run db:seed          # Seed database
```

**Frontend:**
```bash
cd frontend
pnpm run dev              # Start Next.js dev server
pnpm run build            # Build for production
pnpm run start            # Start production build
pnpm run lint             # Run ESLint
```

**MCP Server:**
```bash
cd mcp-server
pnpm run dev              # Start with hot-reload (tsx)
pnpm run build            # Build TypeScript
pnpm run start            # Start production build
```

**Scheduler:**
```bash
cd scheduler
pnpm run dev              # Start with hot-reload (tsx)
pnpm run build            # Build TypeScript
pnpm run start            # Start production build
```

## Environment Variables

### Automatic Setup

Run `pnpm run setup:env` to auto-generate all `.env` files from `.env.example` templates.

### Manual Setup

Each service needs its own `.env` file:

**Root `.env`:**
```env
POSTGRES_USER=pfs_user
POSTGRES_PASSWORD=dev_password_123
POSTGRES_DB=pfs_automation
```

**backend/.env:**
```env
PORT=3333
HOST=0.0.0.0
NODE_ENV=development
APP_KEY=auto_generated_32_char_key

DB_CONNECTION=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=pfs_user
DB_PASSWORD=dev_password_123
DB_DATABASE=pfs_automation

REDIS_HOST=localhost
REDIS_PORT=6379
```

**frontend/.env:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3333
NODE_ENV=development
PORT=3000
```

## Development Workflow

### 1. First Time Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/pfs-automation.git
cd pfs-automation/PFS-Automation

# Install root dependencies
pnpm install

# Setup environment files
pnpm run setup:env

# Start development
pnpm run dev
```

### 2. Daily Development

```bash
# Start all services
pnpm run dev

# Open browser at http://localhost:3000
# Make changes - hot reload will update automatically
# Press Ctrl+C to stop all services
```

### 3. Working on a Specific Service

```bash
# Start only infrastructure
docker-compose up postgres redis

# Work on backend
cd backend
pnpm run dev

# Work on frontend (in another terminal)
cd frontend
pnpm run dev
```

### 4. Database Changes

```bash
cd backend

# Create a new migration
pnpm exec ace make:migration migration_name

# Edit the migration file in database/migrations/

# Run migrations
pnpm run migration:run

# Rollback if needed
pnpm run migration:rollback
```

## Service URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js app |
| Backend API | http://localhost:3333 | REST API |
| Backend Health | http://localhost:3333/health | Health check |
| MCP Server | http://localhost:3334 | MCP protocol |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache |

## Hot Reload

All services support hot reload in development:

- **Backend**: AdonisJS watches for file changes
- **Frontend**: Next.js fast refresh
- **MCP/Scheduler**: tsx watch mode

## Debugging

### Backend (AdonisJS)

Add debugger statements or use the Node.js inspector:

```bash
cd backend
node --inspect ace serve --watch
```

Then attach your debugger (VS Code, Chrome DevTools, etc.)

### Frontend (Next.js)

Use React DevTools browser extension and console.log:

```tsx
console.log('Debug:', someVariable)
```

Or use VS Code debugger with this launch.json:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Next.js: debug",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["run", "dev"],
  "cwd": "${workspaceFolder}/frontend",
  "console": "integratedTerminal"
}
```

## Testing

### Backend Tests

```bash
cd backend
# Add tests in tests/ directory
pnpm test
```

### Frontend Tests

```bash
cd frontend
# Add tests alongside components
pnpm test
```

## Common Issues

### Port Already in Use

```bash
# Find process using port
lsof -i :3000  # or :3333, :5432, etc.

# Kill process
kill -9 <PID>
```

### Database Connection Error

```bash
# Ensure PostgreSQL is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Migration Errors

```bash
cd backend

# Check migration status
pnpm exec ace migration:status

# Rollback and retry
pnpm run migration:rollback
pnpm run migration:run
```

### Node Modules Issues

```bash
# Clean and reinstall everything
pnpm run clean
pnpm install
pnpm run install:all
```

## VS Code Setup

Install recommended extensions:
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Docker
- PostgreSQL

Workspace settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.experimental.classRegex": [
    ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

## Performance Tips

1. **Use pnpm** instead of npm (faster, saves disk space)
2. **Don't run all services** if you're only working on one
3. **Use Docker Desktop** for better performance on Mac/Windows
4. **Close unused terminals** to save resources

## Next Steps

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- See [SECURITY.md](SECURITY.md) for security practices

Happy coding! 🚀
