# PFS Automation

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![Status](https://img.shields.io/badge/status-stable-green.svg)

Professional Financial Services Automation Platform - A comprehensive solution for audit and financial process automation.

## Features

- **Web-Based Setup Interface**: Easy first-time configuration through a user-friendly web interface
- **Secure by Default**: No hardcoded credentials, all sensitive data managed via environment variables
- **Microservices Architecture**: Modular design with separate services for frontend, backend, MCP server, and scheduler
- **Docker-Ready**: One-command deployment with Docker Compose
- **Database Auto-Migration**: Automatic database setup and schema migration on first startup
- **Persistent Data**: PostgreSQL and Redis data persist across container restarts

## Architecture

```
├── Frontend (Next.js)       - Port 3000
├── Backend (AdonisJS)       - Port 3333
├── MCP Server (Express)     - Port 3334
├── Scheduler (Node.js)      - Background tasks
├── PostgreSQL               - Port 5432
├── Redis                    - Port 6379
└── NGINX (Reverse Proxy)    - Ports 80, 443
```

## Prerequisites

- Docker (version 24.0 or higher)
- Docker Compose (version 2.20 or higher)
- Git

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/pfs-automation.git
cd pfs-automation
```

### 2. Configure Environment Variables

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit the `.env` file and configure the following **required** variables:

```env
# Database credentials (CHANGE THESE!)
POSTGRES_USER=pfs_user
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=pfs_automation

# Backend security key (generate a random 32+ character string)
APP_KEY=your_secure_random_key_min_32_characters

# Optional: Customize ports if needed
NGINX_HTTP_PORT=80
NGINX_HTTPS_PORT=443
BACKEND_PORT=3333
FRONTEND_PORT=3000
MCP_SERVER_PORT=3334
```

**IMPORTANT**: Generate a secure `APP_KEY` using one of these methods:

```bash
# Option 1: Using OpenSSL
openssl rand -base64 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Start the Application

```bash
docker-compose up -d
```

This will:
- Build all Docker images
- Create and start all containers
- Initialize the PostgreSQL database
- Run database migrations automatically
- Start all services

### 4. Complete Initial Setup

1. Open your browser and navigate to: `http://localhost` (or your server IP)
2. You'll be automatically redirected to the setup page: `http://localhost/setup`
3. Fill in the administrator account details:
   - Email address
   - Username
   - Password (minimum 8 characters)
   - First and Last name (optional)
4. Click "Complete Setup"
5. You'll be redirected to the login page

**That's it!** Your PFS Automation instance is now ready to use.

## Management Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Stop the Application

```bash
docker-compose down
```

### Stop and Remove All Data (WARNING: Destructive)

```bash
docker-compose down -v
```

### Restart a Service

```bash
docker-compose restart backend
```

### Rebuild After Code Changes

```bash
docker-compose up -d --build
```

## Service Health Checks

All services include health checks. Check service status:

```bash
docker-compose ps
```

Individual health endpoints:
- Backend: `http://localhost:3333/health`
- Frontend: `http://localhost:3000/api/health`
- NGINX: `http://localhost/health`

## Database Management

### Access PostgreSQL

```bash
docker-compose exec postgres psql -U pfs_user -d pfs_automation
```

### Run Migrations Manually

```bash
docker-compose exec backend node ace migration:run
```

### Create Database Backup

```bash
docker-compose exec postgres pg_dump -U pfs_user pfs_automation > backup.sql
```

### Restore Database Backup

```bash
cat backup.sql | docker-compose exec -T postgres psql -U pfs_user pfs_automation
```

## Security Best Practices

1. **Change Default Credentials**: Always change the default PostgreSQL password
2. **Use Strong APP_KEY**: Generate a cryptographically secure random key
3. **Enable HTTPS**: In production, configure SSL certificates with NGINX
4. **Firewall**: Only expose necessary ports (80, 443) to the internet
5. **Regular Updates**: Keep Docker images and dependencies updated
6. **Backup Strategy**: Implement regular database backups

## Production Deployment

### Using a Reverse Proxy (Recommended)

For production, use a reverse proxy like Traefik or Nginx Proxy Manager with automatic SSL:

```yaml
# Example with Traefik labels (add to nginx service)
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.pfs.rule=Host(`your-domain.com`)"
  - "traefik.http.routers.pfs.entrypoints=websecure"
  - "traefik.http.routers.pfs.tls.certresolver=letsencrypt"
```

### Environment-Specific Configuration

Create separate environment files:
- `.env.development`
- `.env.staging`
- `.env.production`

Load the appropriate file:

```bash
docker-compose --env-file .env.production up -d
```

## Development

### Quick Development Mode (Recommended)

Start all services with a single command:

```bash
# Option 1: Using the dev script
./dev.sh

# Option 2: Using pnpm directly
pnpm install
pnpm run dev
```

This will:
1. Setup all `.env` files automatically
2. Start PostgreSQL & Redis in Docker
3. Install dependencies for all services
4. Run database migrations
5. Start all services in watch mode
6. Automatically open the browser at http://localhost:3000

**To stop**: Press `Ctrl+C` in the terminal

### Manual Development Setup

If you prefer to run services individually:

```bash
# Terminal 1 - Infrastructure
docker-compose up postgres redis

# Terminal 2 - Backend
cd backend
pnpm install
cp .env.example .env
pnpm run migration:run
pnpm run dev

# Terminal 3 - Frontend
cd frontend
pnpm install
cp .env.example .env
pnpm run dev

# Terminal 4 - MCP Server (optional)
cd mcp-server
pnpm install
cp .env.example .env
pnpm run dev

# Terminal 5 - Scheduler (optional)
cd scheduler
pnpm install
cp .env.example .env
pnpm run dev
```

### Available Scripts (at root)

```bash
pnpm run dev              # Start all services in development mode
pnpm run setup:env        # Setup all .env files
pnpm run install:all      # Install dependencies for all services
pnpm run build            # Build all services
pnpm run clean            # Clean all node_modules and Docker volumes
pnpm run docker:up        # Start all services in Docker
pnpm run docker:down      # Stop all Docker services
pnpm run docker:logs      # View Docker logs
```

## Troubleshooting

### Setup Page Won't Load

1. Check if all services are running: `docker-compose ps`
2. Check backend logs: `docker-compose logs backend`
3. Ensure migrations ran successfully: `docker-compose exec backend node ace migration:status`

### Database Connection Issues

1. Verify PostgreSQL is healthy: `docker-compose ps postgres`
2. Check credentials in `.env` match between services
3. Ensure PostgreSQL is fully started before backend: `docker-compose logs postgres`

### Port Conflicts

If ports are already in use, modify them in `.env`:

```env
NGINX_HTTP_PORT=8080
NGINX_HTTPS_PORT=8443
```

### Reset Everything

To start fresh (WARNING: Deletes all data):

```bash
docker-compose down -v
docker system prune -a
rm -rf postgres-data redis-data
docker-compose up -d
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues, questions, or contributions:
- GitHub Issues: [https://github.com/yourusername/pfs-automation/issues](https://github.com/yourusername/pfs-automation/issues)
- Documentation: [https://docs.pfs-automation.com](https://docs.pfs-automation.com)

## Acknowledgments

Built with:
- [AdonisJS](https://adonisjs.com/) - Backend framework
- [Next.js](https://nextjs.org/) - Frontend framework
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Cache and session store
- [Docker](https://www.docker.com/) - Containerization
