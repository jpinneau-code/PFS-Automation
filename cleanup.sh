#!/bin/bash

echo "🧹 Cleaning up PFS Automation..."

# Stop all containers
echo "Stopping containers..."
docker-compose down 2>/dev/null || true

# Remove any orphaned containers
echo "Removing orphaned containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Clean up networks (if they exist)
echo "Cleaning up networks..."
docker network rm pfs-automation_audit-network 2>/dev/null || true
docker network rm audit-network 2>/dev/null || true

echo "✅ Cleanup complete!"
echo ""
echo "You can now run: pnpm run dev"
