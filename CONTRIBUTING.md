# Contributing to PFS Automation

Thank you for your interest in contributing to PFS Automation! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/pfs-automation.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Commit your changes: `git commit -m 'Add some feature'`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Git

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/pfs-automation.git
cd pfs-automation

# Start infrastructure services (PostgreSQL, Redis)
docker-compose up -d postgres redis

# Backend development
cd backend
npm install
cp .env.example .env
# Edit .env with local settings
npm run dev

# Frontend development (in another terminal)
cd frontend
npm install
cp .env.example .env
npm run dev

# MCP Server development (in another terminal)
cd mcp-server
npm install
cp .env.example .env
npm run dev
```

## Project Structure

```
pfs-automation/
├── backend/           # AdonisJS backend API
├── frontend/          # Next.js frontend
├── mcp-server/        # MCP server service
├── scheduler/         # Background scheduler
├── docker/            # Docker configurations
│   ├── nginx/        # NGINX reverse proxy config
│   └── postgres/     # PostgreSQL initialization
├── docker-compose.yml # Docker Compose configuration
└── README.md         # Documentation
```

## Coding Standards

### General Guidelines

- Write clean, readable, and maintainable code
- Follow existing code style and patterns
- Add comments for complex logic
- Keep functions small and focused
- Use meaningful variable and function names

### TypeScript/JavaScript

- Use TypeScript for type safety
- Follow ESLint rules (configured in each service)
- Use async/await instead of callbacks
- Handle errors appropriately
- Use const/let instead of var

### Backend (AdonisJS)

- Follow AdonisJS conventions
- Use Lucid ORM for database operations
- Implement proper validation for all inputs
- Use middleware for authentication and authorization
- Create migrations for database changes

### Frontend (Next.js)

- Use functional components with hooks
- Implement proper error boundaries
- Use TypeScript interfaces for props
- Keep components small and reusable
- Use CSS modules or Tailwind for styling

## Security Guidelines

**CRITICAL**: Never commit sensitive information

- ❌ NO hardcoded credentials
- ❌ NO API keys in code
- ❌ NO passwords in code
- ❌ NO .env files (only .env.example)
- ✅ Use environment variables
- ✅ Use .gitignore properly
- ✅ Validate all user inputs
- ✅ Sanitize database queries
- ✅ Implement proper authentication

## Testing

- Write tests for new features
- Ensure existing tests pass
- Test edge cases and error scenarios
- Test with different data sets

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## Database Migrations

When creating database changes:

```bash
cd backend

# Create a new migration
node ace make:migration migration_name

# Edit the migration file in database/migrations/

# Run migrations
node ace migration:run

# Rollback if needed
node ace migration:rollback
```

**Important**:
- Always create reversible migrations
- Test both up and down migrations
- Never modify existing migrations that are in production

## Pull Request Process

1. **Update Documentation**: Update README.md if you change functionality
2. **Test Thoroughly**: Ensure all tests pass and add new tests
3. **Follow Code Style**: Match existing code style
4. **Describe Changes**: Write a clear PR description explaining what and why
5. **Link Issues**: Reference related issues in the PR description
6. **Small PRs**: Keep PRs focused on a single feature or fix

### PR Title Format

Use conventional commits format:

- `feat: Add user authentication`
- `fix: Resolve database connection issue`
- `docs: Update installation instructions`
- `refactor: Improve error handling`
- `test: Add tests for user model`
- `chore: Update dependencies`

## Commit Message Guidelines

Write clear, descriptive commit messages:

```
feat: Add password reset functionality

- Implement password reset email
- Add reset token generation
- Create reset password form
- Add tests for reset flow

Closes #123
```

## Reporting Bugs

When reporting bugs, include:

1. **Description**: Clear description of the bug
2. **Steps to Reproduce**: Detailed steps to reproduce the issue
3. **Expected Behavior**: What should happen
4. **Actual Behavior**: What actually happens
5. **Environment**: OS, Docker version, browser, etc.
6. **Screenshots**: If applicable
7. **Logs**: Relevant error messages or logs

## Feature Requests

When requesting features:

1. **Use Case**: Explain why this feature is needed
2. **Description**: Clear description of the proposed feature
3. **Examples**: Provide examples or mockups if possible
4. **Alternatives**: Mention alternative solutions you've considered

## Documentation

- Update documentation for any changed functionality
- Add JSDoc comments for functions
- Document environment variables in .env.example
- Update ARCHITECTURE.md for structural changes

## Questions?

- Open an issue for questions
- Check existing issues and documentation first
- Be specific and provide context

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

## Thank You!

Your contributions make this project better. Thank you for taking the time to contribute!
