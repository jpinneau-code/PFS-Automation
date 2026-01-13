#!/bin/bash
set -e

# This script runs automatically when PostgreSQL container starts for the first time
# It creates the database if it doesn't exist

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create extensions if needed
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";

    -- Log successful initialization
    SELECT 'Database initialized successfully' AS status;
EOSQL

echo "PostgreSQL initialization completed"
