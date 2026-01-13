FROM postgres:16-alpine

# Install additional tools if needed
RUN apk add --no-cache bash

# Copy initialization scripts
COPY init-scripts/ /docker-entrypoint-initdb.d/

# Set permissions
RUN chmod +x /docker-entrypoint-initdb.d/*.sh

# Expose PostgreSQL port
EXPOSE 5432
