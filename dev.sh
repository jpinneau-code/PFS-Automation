#!/bin/bash

set -e

echo "======================================"
echo "PFS Automation - Development Mode"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}⚠️  pnpm is not installed. Installing...${NC}"
    npm install -g pnpm
fi

# Setup environment files
if [ ! -f .env ]; then
    echo "📝 Setting up environment files..."
    pnpm run setup:env
fi

# Install root dependencies
if [ ! -d node_modules ]; then
    echo "📦 Installing root dependencies..."
    pnpm install
fi

echo ""
echo -e "${GREEN}🚀 Starting development environment...${NC}"
echo ""
echo "Services will start in this order:"
echo "  1. PostgreSQL & Redis (Docker)"
echo "  2. Backend API (port 3333)"
echo "  3. Frontend (port 3000) + Auto-open browser"
echo "  4. MCP Server (port 3334)"
echo "  5. Scheduler"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""
sleep 2

# Start all services
pnpm run dev
