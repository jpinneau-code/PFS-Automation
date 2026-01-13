# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of PFS Automation seriously. If you discover a security vulnerability, please follow these steps:

1. **DO NOT** open a public GitHub issue
2. Email security details to: [your-security-email@example.com]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

## Security Best Practices

### For Deployment

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use strong, randomly generated passwords
   - Rotate credentials regularly
   - Use different credentials for each environment

2. **Network Security**
   - Use firewall rules to restrict access
   - Only expose necessary ports (80, 443)
   - Consider using VPN for admin access
   - Implement rate limiting on NGINX

3. **SSL/TLS**
   - Always use HTTPS in production
   - Use valid SSL certificates (Let's Encrypt recommended)
   - Configure strong cipher suites
   - Enable HSTS headers

4. **Database**
   - Use strong PostgreSQL passwords
   - Restrict database access to localhost
   - Enable PostgreSQL SSL connections
   - Regular backup strategy
   - Encrypt backups

5. **Application**
   - Keep dependencies updated
   - Use Docker image scanning (Trivy, Snyk)
   - Enable security headers (already configured in NGINX)
   - Implement proper session management
   - Use CSRF protection

### Security Headers (Configured in NGINX)

The following security headers are already configured:

```nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

For production, consider adding:
```nginx
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

### Environment Variables Security

**CRITICAL**: These must be changed from defaults:

- `POSTGRES_PASSWORD`: Use 20+ character random string
- `APP_KEY`: Use 32+ character random string
- `REDIS_PASSWORD`: Use strong password (optional but recommended)

Generate secure values:
```bash
# PostgreSQL password
openssl rand -base64 32

# APP_KEY
openssl rand -base64 32

# Redis password
openssl rand -hex 20
```

### Docker Security

1. **Images**
   - All services run as non-root users
   - Use official base images only
   - Keep base images updated
   - Scan images regularly

2. **Volumes**
   - Database volumes use proper permissions
   - Sensitive data stays in volumes
   - Regular backup of volumes

3. **Network**
   - Services use isolated Docker network
   - Backend uses host network for performance (review for your setup)
   - Database not exposed to host

### Code Security

1. **Input Validation**
   - All user inputs are validated
   - SQL injection prevention via ORM
   - XSS prevention via framework
   - CSRF protection enabled

2. **Authentication**
   - Passwords hashed with bcrypt
   - Session management via secure cookies
   - Password complexity requirements
   - Account lockout after failed attempts (implement as needed)

3. **Authorization**
   - Role-based access control
   - Setup middleware protects routes
   - Admin-only endpoints protected

### Regular Security Tasks

- [ ] Update dependencies monthly
- [ ] Review access logs weekly
- [ ] Backup database daily
- [ ] Rotate credentials quarterly
- [ ] Security audit annually
- [ ] Update Docker base images monthly
- [ ] Review and update firewall rules quarterly

### Security Checklist for Production

Before deploying to production:

- [ ] Changed all default passwords
- [ ] Generated secure APP_KEY
- [ ] Enabled HTTPS with valid certificate
- [ ] Configured firewall rules
- [ ] Set up regular backups
- [ ] Configured monitoring and alerts
- [ ] Reviewed and hardened NGINX config
- [ ] Enabled Docker security scanning
- [ ] Documented incident response plan
- [ ] Set up log aggregation
- [ ] Configured rate limiting
- [ ] Tested disaster recovery

### Known Security Considerations

1. **Setup Page**: After initial setup is complete, the setup page is automatically disabled. The database tracks setup completion status.

2. **Database Migrations**: Migrations run automatically on startup. Ensure migration files are reviewed before deployment.

3. **CORS**: CORS is configured to allow the frontend domain. Update `ALLOWED_ORIGINS` in production.

4. **Session Storage**: Sessions use cookie-based storage. Consider Redis for session storage in high-traffic scenarios.

### Compliance

This application can be configured to meet various compliance requirements:

- **GDPR**: User data management and deletion capabilities
- **SOC 2**: Audit logging and access controls
- **HIPAA**: Encryption and access controls (requires additional configuration)

### Third-Party Dependencies

We use automated dependency scanning via:
- Dependabot (GitHub)
- Trivy (Docker images)
- npm audit (Node.js packages)

### Security Updates

Security updates will be released as soon as possible. Subscribe to repository notifications to stay informed.

### License

This security policy is part of the PFS Automation project, licensed under the MIT License.
