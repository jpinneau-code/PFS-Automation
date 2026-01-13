#!/bin/bash

set -e

echo "======================================"
echo "PFS Automation - Setup Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose first: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed${NC}"
echo -e "${GREEN}✓ Docker Compose is installed${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env

    # Generate random APP_KEY
    if command -v openssl &> /dev/null; then
        APP_KEY=$(openssl rand -base64 32)
        # Replace APP_KEY in .env file
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|APP_KEY=generate_a_secure_random_key_here_32_chars_min|APP_KEY=$APP_KEY|g" .env
        else
            # Linux
            sed -i "s|APP_KEY=generate_a_secure_random_key_here_32_chars_min|APP_KEY=$APP_KEY|g" .env
        fi
        echo -e "${GREEN}✓ Generated secure APP_KEY${NC}"
    fi

    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Please edit the .env file and set the following:${NC}"
    echo "   - POSTGRES_PASSWORD (change from default)"
    echo "   - Review other settings as needed"
    echo ""
    read -p "Press Enter to continue after editing .env file..."
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo ""
echo "======================================"
echo "Starting PFS Automation..."
echo "======================================"
echo ""

# Stop any existing containers
echo "Stopping any existing containers..."
docker-compose down 2>/dev/null || true

# Build and start containers
echo ""
echo "Building and starting Docker containers..."
echo "This may take several minutes on first run..."
echo ""

docker-compose up -d --build

# Wait for services to be healthy
echo ""
echo "Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo ""
    echo -e "${GREEN}======================================"
    echo "✓ PFS Automation is running!"
    echo "======================================${NC}"
    echo ""
    echo "Access the application:"
    echo "  🌐 Web Interface: http://localhost"
    echo "  📝 Setup Page: http://localhost/setup"
    echo ""
    echo "Service URLs:"
    echo "  - Frontend: http://localhost:3000"
    echo "  - Backend API: http://localhost:3333"
    echo "  - MCP Server: http://localhost:3334"
    echo ""
    echo "Useful commands:"
    echo "  - View logs: docker-compose logs -f"
    echo "  - Stop: docker-compose down"
    echo "  - Restart: docker-compose restart"
    echo ""
    echo -e "${YELLOW}Next step: Open http://localhost/setup to create your admin account${NC}"
else
    echo -e "${RED}Error: Some services failed to start${NC}"
    echo "Check logs with: docker-compose logs"
    exit 1
fi
