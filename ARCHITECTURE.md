Project name : PFS Automation

## Diagramme d'architecture

```
                                    INTERNET
                                        |
                                        v
                    +-------------------+-------------------+
                    |              UFW Firewall             |
                    |         (ports 80, 443 ouverts)       |
                    +-------------------+-------------------+
                                        |
                                        v
                    +-------------------------------------------+
                    |              NGINX (audit-nginx)          |
                    |              Ports: 80, 443               |
                    |              Network: audit-network       |
                    |              IP: 172.19.0.x               |
                    +-------------------------------------------+
                            |           |           |
            +---------------+           |           +---------------+
            |                           |                           |
            v                           v                           v
    +-----------------+       +------------------+        +------------------+
    |    Frontend     |       |     Backend      |        |    MCP Server    |
    |  (audit-frontend)|      | (audit-backend)  |        |(audit-mcp-server)|
    |   Next.js       |       |    AdonisJS      |        |   Express + MCP  |
    |   Port: 3000    |       |    Port: 3333    |        |   Port: 3334     |
    | audit-network   |       |  network: host   |        |  network: host   |
    +-----------------+       +------------------+        +------------------+
                                      |                           |
                                      |     +---------------------+
                                      |     |
                                      v     v
                            +-------------------+
                            |    PostgreSQL     |
                            | (Postgres-Oleanis)|
                            |    Port: 5432     |
                            |   (standalone)    |
                            +-------------------+

    +------------------+        +------------------+
    |    Scheduler     |        |      Redis       |
    | (audit-scheduler)|        |  (audit-redis)   |
    |  network: host   |        |  audit-network   |
    +------------------+        +------------------+
            |                           ^
            +---------------------------+
                    (via 127.0.0.1:6379)
```
