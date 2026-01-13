#!/bin/bash

# PFS Automation - Health Check Script
# This script checks the health of all services

echo "======================================"
echo "PFS Automation - Health Check"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_service() {
    local service=$1
    local url=$2

    if curl -f -s -o /dev/null "$url"; then
        echo -e "${GREEN}✓ $service is healthy${NC}"
        return 0
    else
        echo -e "${RED}✗ $service is unhealthy${NC}"
        return 1
    fi
}

echo "Checking Docker containers..."
docker-compose ps
echo ""

echo "Checking service health endpoints..."
echo ""

# Check individual services
check_service "Backend API" "http://localhost:3333/health"
check_service "Frontend" "http://localhost:3000/api/health"
check_service "NGINX" "http://localhost/health"

echo ""
echo "======================================"

# Check if all services are running
RUNNING=$(docker-compose ps | grep -c "Up")
TOTAL=$(docker-compose ps | tail -n +2 | wc -l)

if [ "$RUNNING" -eq "$TOTAL" ]; then
    echo -e "${GREEN}All services are running ($RUNNING/$TOTAL)${NC}"
else
    echo -e "${YELLOW}Some services may be down ($RUNNING/$TOTAL running)${NC}"
fi

echo "======================================"
