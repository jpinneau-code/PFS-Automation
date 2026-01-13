# PFS Automation - Quick Start Guide

Get PFS Automation running in 5 minutes!

## Prerequisites

✅ Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
✅ Docker Compose installed
✅ 2GB free RAM
✅ 5GB free disk space

## Installation Steps

### Option 1: Development Mode (Quick Start)

For development with hot-reload:

```bash
# Clone and start
git clone https://github.com/yourusername/pfs-automation.git
cd pfs-automation/PFS-Automation

# Install and run everything
pnpm install
pnpm run dev
```

That's it! The browser will open automatically at http://localhost:3000

### Option 2: Docker Production Mode (Recommended for deployment)

```bash
# Clone the repository
git clone https://github.com/yourusername/pfs-automation.git
cd pfs-automation

# Run the setup script
./setup.sh
```

The script will:
1. Check if Docker is installed
2. Create `.env` file from template
3. Generate secure `APP_KEY`
4. Build and start all containers
5. Display access URLs

**That's it!** Open http://localhost/setup to create your admin account.

### Option 2: Manual Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/pfs-automation.git
cd pfs-automation

# Create environment file
cp .env.example .env

# Edit .env and set required variables
nano .env  # or vim, code, etc.

# REQUIRED: Change these values
# POSTGRES_PASSWORD=your_secure_password
# APP_KEY=generate_a_32_character_random_key

# Start all services
docker-compose up -d

# Wait for services to start (about 30 seconds)
sleep 30

# Check if services are running
docker-compose ps
```

### Option 3: One-Liner (for testing only)

```bash
git clone https://github.com/yourusername/pfs-automation.git && \
cd pfs-automation && \
cp .env.example .env && \
sed -i 's/POSTGRES_PASSWORD=change_me_secure_password/POSTGRES_PASSWORD=test123/g' .env && \
docker-compose up -d
```

⚠️ **Warning**: This uses a weak password. Only for testing!

## First Access

1. **Open your browser**: http://localhost
2. **You'll be redirected to**: http://localhost/setup
3. **Fill the form**:
   - Email: your@email.com
   - Username: admin
   - Password: (min 8 characters)
   - First/Last name: (optional)
4. **Click "Complete Setup"**
5. **Done!** You'll be redirected to login

## Verify Installation

```bash
# Check all services are running
docker-compose ps

# Should show all services as "Up"

# Test health endpoints
curl http://localhost/health
curl http://localhost:3333/health

# View logs
docker-compose logs -f
```

## Access URLs

| Service | URL | Description |
|---------|-----|-------------|
| Web Interface | http://localhost | Main application |
| Setup Page | http://localhost/setup | First-time setup (auto-disabled after) |
| Backend API | http://localhost:3333 | REST API |
| Frontend | http://localhost:3000 | Next.js app |
| MCP Server | http://localhost:3334 | MCP protocol server |

## Common Commands

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend

# Restart a service
docker-compose restart backend

# Stop all services
docker-compose down

# Stop and remove data (fresh start)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build

# Check service health
./health-check.sh
```

## Troubleshooting

### Services won't start

```bash
# Check Docker is running
docker ps

# Check for port conflicts
lsof -i :80
lsof -i :3333

# View error logs
docker-compose logs
```

### Can't access http://localhost

1. Check NGINX is running: `docker-compose ps nginx`
2. Check port 80 is not in use: `lsof -i :80`
3. Try accessing directly: http://localhost:3000
4. Check firewall settings

### Database connection errors

```bash
# Verify PostgreSQL is healthy
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Ensure migrations ran
docker-compose exec backend node ace migration:status
```

### Setup page shows after initial setup

This shouldn't happen. If it does:

```bash
# Check database
docker-compose exec postgres psql -U pfs_user -d pfs_automation
# Run: SELECT * FROM setup_statuses;
# is_setup_complete should be true

# If false, manually update:
# UPDATE setup_statuses SET is_setup_complete = true WHERE id = 1;
```

### Reset everything

```bash
# Stop and remove all containers and volumes
docker-compose down -v

# Remove Docker images (optional)
docker-compose down --rmi all

# Start fresh
docker-compose up -d
```

## Default Ports

- **80**: NGINX HTTP
- **443**: NGINX HTTPS (not configured by default)
- **3000**: Frontend (internal)
- **3333**: Backend API (exposed via host network)
- **3334**: MCP Server (exposed via host network)
- **5432**: PostgreSQL (internal only)
- **6379**: Redis (internal only)

## Change Ports

Edit `.env` file:

```env
NGINX_HTTP_PORT=8080
NGINX_HTTPS_PORT=8443
BACKEND_PORT=3333
FRONTEND_PORT=3000
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

## Enable HTTPS

### Option 1: Let's Encrypt (Recommended)

Use with Traefik or Nginx Proxy Manager for automatic SSL.

### Option 2: Self-Signed Certificate (Testing)

```bash
# Generate certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/nginx.key \
  -out docker/nginx/ssl/nginx.crt

# Update nginx.conf to use SSL
# Restart NGINX
docker-compose restart nginx
```

## Production Checklist

Before deploying to production:

- [ ] Change `POSTGRES_PASSWORD` to a strong password
- [ ] Generate secure `APP_KEY` (32+ characters)
- [ ] Enable HTTPS with valid certificate
- [ ] Configure firewall (only allow 80, 443)
- [ ] Set `NODE_ENV=production`
- [ ] Configure backup strategy
- [ ] Set up monitoring
- [ ] Review and update `ALLOWED_ORIGINS`
- [ ] Enable Redis password
- [ ] Configure rate limiting
- [ ] Set up log rotation

## Need Help?

- 📖 **Full Documentation**: [README.md](README.md)
- 🏗️ **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- 🔒 **Security**: [SECURITY.md](SECURITY.md)
- 🤝 **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md)
- 🐛 **Issues**: [GitHub Issues](https://github.com/yourusername/pfs-automation/issues)

## What's Next?

After setup:

1. **Explore the interface**: Log in with your admin account
2. **Read the docs**: Understand the architecture
3. **Customize**: Add your business logic
4. **Deploy**: Push to production
5. **Contribute**: Share improvements with the community

---

**Enjoy using PFS Automation!** 🚀
