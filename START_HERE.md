# 🚀 START HERE - PFS Automation

Welcome! This is the fastest way to get started with PFS Automation.

## 🎯 What Do You Want To Do?

### 1. Quick Test (Development)

**Perfect for:** Testing, development, local experimentation

```bash
cd PFS-Automation
pnpm install
pnpm run dev
```

✅ Browser opens automatically at http://localhost:3000
✅ Hot reload enabled
✅ All services start automatically

**Stop:** Press `Ctrl+C`

---

### 2. Deploy to Production (Docker)

**Perfect for:** Production deployment, hosting, stable environment

```bash
cd PFS-Automation
./setup.sh
```

✅ Creates secure passwords automatically
✅ Starts all services in Docker
✅ Production-ready configuration

**Access:** http://your-server-ip

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Complete documentation |
| [QUICKSTART.md](QUICKSTART.md) | 5-minute setup guide |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Developer guide |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture |
| [SECURITY.md](SECURITY.md) | Security best practices |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

---

## ⚡ Super Quick Commands

```bash
# Development
pnpm run dev              # Start everything with hot reload
./dev.sh                  # Alternative dev mode

# Production (Docker)
./setup.sh                # Setup and deploy
docker-compose up -d      # Start production
docker-compose down       # Stop production
docker-compose logs -f    # View logs

# Utilities
pnpm run clean            # Clean everything
pnpm run install:all      # Install all dependencies
./health-check.sh         # Check service health
```

---

## 🆘 Need Help?

**First Setup:**
1. Complete the web setup at http://localhost:3000/setup
2. Create your admin account
3. Start using the app!

**Troubleshooting:**
- Check [README.md - Troubleshooting](README.md#troubleshooting)
- Run `./health-check.sh` to verify services
- View logs: `docker-compose logs -f`

**Questions:**
- Open an issue on GitHub
- Check existing documentation

---

## 🎓 What's Next?

After setup:
1. ✅ Explore the interface
2. ✅ Read the architecture docs
3. ✅ Start customizing
4. ✅ Deploy to production
5. ✅ Contribute improvements

---

**Made with ❤️ for the Open Source community**

Ready? Pick option 1 or 2 above and let's go! 🚀
