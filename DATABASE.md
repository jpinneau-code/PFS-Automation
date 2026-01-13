# Database Schema Documentation

## Overview

This document describes the complete database schema for the PFS Automation system. The database is designed to manage projects, users, clients, stages, and tasks with proper security constraints.

## Schema Diagram

```
users ─────┬─────> projects ─────┬─────> stages ──────> tasks
           │                      │
           └──────> project_users─┘
           │
           └──────> clients
```

## Tables

### 1. `users`

Stores all user accounts in the system with role-based access control.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique user identifier |
| username | VARCHAR(255) | UNIQUE, NOT NULL | Unique username |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Unique email address |
| password | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| first_name | VARCHAR(255) | | User's first name |
| last_name | VARCHAR(255) | | User's last name |
| user_type | VARCHAR(50) | NOT NULL, DEFAULT 'actor' | Role: 'administrator', 'project_manager', 'actor' |
| preferred_language | VARCHAR(10) | DEFAULT 'en' | Preferred UI language: 'en', 'fr', 'es', 'de' |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Account active status |
| last_login_at | TIMESTAMP | | Last successful login timestamp |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Account creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_users_user_type` on `user_type`
- `idx_users_email` on `email`
- `idx_users_is_active` on `is_active`

**Constraints:**
- `check_user_type`: user_type IN ('administrator', 'project_manager', 'actor')
- `check_preferred_language`: preferred_language IN ('en', 'fr', 'es', 'de')

---

### 2. `clients`

Stores client/customer information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique client identifier |
| client_name | VARCHAR(255) | NOT NULL | Client company name |
| contact_first_name | VARCHAR(255) | | Contact person first name |
| contact_last_name | VARCHAR(255) | | Contact person last name |
| contact_email | VARCHAR(255) | | Contact email address |
| contact_phone | VARCHAR(50) | | Contact phone number |
| address | TEXT | | Full address |
| city | VARCHAR(255) | | City |
| country | VARCHAR(100) | | Country |
| postal_code | VARCHAR(20) | | Postal/ZIP code |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | Client active status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last update timestamp |
| created_by | INTEGER | FOREIGN KEY (users.id) ON DELETE SET NULL | User who created the client |

**Indexes:**
- `idx_clients_client_name` on `client_name`
- `idx_clients_is_active` on `is_active`

---

### 3. `projects`

Stores project information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique project identifier |
| project_name | VARCHAR(255) | NOT NULL | Project name |
| client_id | INTEGER | NOT NULL, FOREIGN KEY (clients.id) ON DELETE RESTRICT | Associated client |
| project_manager_id | INTEGER | NOT NULL, FOREIGN KEY (users.id) ON DELETE RESTRICT | Project manager |
| country | VARCHAR(100) | | Project country |
| status | VARCHAR(50) | NOT NULL, DEFAULT 'created' | Status: 'created', 'in_progress', 'frozen', 'closed' |
| start_date | DATE | | Project start date |
| end_date | DATE | | Project end date |
| description | TEXT | | Project description |
| budget | DECIMAL(15, 2) | | Project budget |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last update timestamp |
| created_by | INTEGER | FOREIGN KEY (users.id) ON DELETE SET NULL | User who created the project |

**Indexes:**
- `idx_projects_client_id` on `client_id`
- `idx_projects_project_manager_id` on `project_manager_id`
- `idx_projects_status` on `status`
- `idx_projects_start_date` on `start_date`

**Constraints:**
- `check_project_status`: status IN ('created', 'in_progress', 'frozen', 'closed')

---

### 4. `project_users`

Many-to-many relationship table linking users to projects.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique assignment identifier |
| project_id | INTEGER | NOT NULL, FOREIGN KEY (projects.id) ON DELETE RESTRICT | Project reference |
| user_id | INTEGER | NOT NULL, FOREIGN KEY (users.id) ON DELETE RESTRICT | User reference |
| role | VARCHAR(100) | | User's role on this project |
| assigned_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Assignment timestamp |
| assigned_by | INTEGER | FOREIGN KEY (users.id) ON DELETE SET NULL | User who made the assignment |

**Indexes:**
- `idx_project_users_project_id` on `project_id`
- `idx_project_users_user_id` on `user_id`

**Constraints:**
- UNIQUE(project_id, user_id) - A user can be assigned to a project only once

---

### 5. `stages`

Stores project stages/phases.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique stage identifier |
| project_id | INTEGER | NOT NULL, FOREIGN KEY (projects.id) ON DELETE RESTRICT | Parent project |
| stage_name | VARCHAR(255) | NOT NULL | Stage name |
| stage_order | INTEGER | NOT NULL, DEFAULT 0 | Display order within project |
| start_date | DATE | | Stage start date |
| end_date | DATE | | Stage end date |
| description | TEXT | | Stage description |
| is_completed | BOOLEAN | NOT NULL, DEFAULT FALSE | Completion status |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

**Indexes:**
- `idx_stages_project_id` on `project_id`
- `idx_stages_stage_order` on `(project_id, stage_order)`

**Constraints:**
- UNIQUE(project_id, stage_order) - Stage order must be unique within a project

---

### 6. `tasks`

Stores individual tasks.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique task identifier |
| stage_id | INTEGER | FOREIGN KEY (stages.id) ON DELETE RESTRICT | Parent stage (nullable) |
| project_id | INTEGER | NOT NULL, FOREIGN KEY (projects.id) ON DELETE RESTRICT | Parent project |
| task_name | VARCHAR(255) | NOT NULL | Task name |
| description | TEXT | | Task description |
| sold_days | DECIMAL(10, 2) | NOT NULL, DEFAULT 0 | Estimated/sold days |
| responsible_id | INTEGER | FOREIGN KEY (users.id) ON DELETE SET NULL | Assigned user |
| priority | VARCHAR(50) | DEFAULT 'medium' | Priority: 'low', 'medium', 'high', 'urgent' |
| status | VARCHAR(50) | DEFAULT 'todo' | Status: 'todo', 'in_progress', 'review', 'done', 'blocked' |
| start_date | DATE | | Task start date |
| due_date | DATE | | Task due date |
| completed_at | TIMESTAMP | | Completion timestamp |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last update timestamp |
| created_by | INTEGER | FOREIGN KEY (users.id) ON DELETE SET NULL | User who created the task |

**Indexes:**
- `idx_tasks_stage_id` on `stage_id`
- `idx_tasks_project_id` on `project_id`
- `idx_tasks_responsible_id` on `responsible_id`
- `idx_tasks_status` on `status`
- `idx_tasks_priority` on `priority`

**Constraints:**
- `check_task_priority`: priority IN ('low', 'medium', 'high', 'urgent')
- `check_task_status`: status IN ('todo', 'in_progress', 'review', 'done', 'blocked')
- `check_sold_days`: sold_days >= 0

---

## Supporting Tables

### 7. `setup_statuses`

Tracks application setup completion.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique identifier |
| is_setup_complete | BOOLEAN | NOT NULL, DEFAULT FALSE | Setup completion flag |
| setup_completed_at | TIMESTAMP | | Setup completion timestamp |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last update timestamp |

---

### 8. `password_reset_tokens`

Stores password reset tokens.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PRIMARY KEY | Unique token identifier |
| user_id | INTEGER | NOT NULL, FOREIGN KEY (users.id) ON DELETE CASCADE | Associated user |
| token | VARCHAR(255) | UNIQUE, NOT NULL | Reset token |
| expires_at | TIMESTAMP | NOT NULL | Token expiration time |
| used_at | TIMESTAMP | | Token usage timestamp |
| created_at | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Creation timestamp |

**Indexes:**
- `idx_password_reset_tokens_token` on `token`
- `idx_password_reset_tokens_expires_at` on `expires_at`

---

## Security Features

### Delete Policies

- **RESTRICT**: Prevents deletion of referenced records (safe default)
  - Clients with projects
  - Projects with stages/tasks
  - Stages with tasks
  - Users who are project managers or assigned to projects

- **SET NULL**: Sets reference to NULL when parent is deleted
  - `created_by` fields
  - `assigned_by` fields
  - `responsible_id` in tasks

- **CASCADE**: Automatically deletes child records (used sparingly)
  - Password reset tokens when user is deleted

### Data Integrity

1. **Foreign Key Constraints**: All relationships enforced at database level
2. **Check Constraints**: Enum values validated
3. **Unique Constraints**: Prevent duplicate entries
4. **NOT NULL Constraints**: Ensure critical data is always present

---

## Migration & Seeding

### Running Migrations

```bash
cd backend
pnpm run migrate
```

This will:
- Migrate existing `users` table from `is_admin` to `user_type`
- Add new columns safely
- Create necessary indexes

### Seeding Test Data

```bash
cd backend
pnpm run seed
```

This creates:
- 6 users (1 admin + 2 PMs + 3 actors)
- 3 clients
- 3 projects
- 5 stages (for project 1)
- 9 tasks

**Test Credentials:**
- Admin: `jpinneau` / (your setup password)
- PM 1: `pm_alice` / `Test123!`
- PM 2: `pm_bob` / `Test123!`
- Developer 1: `dev_charlie` / `Test123!`
- Developer 2: `dev_diana` / `Test123!`
- QA: `qa_eve` / `Test123!`

---

## Best Practices

1. **Always backup before migrations**
2. **Use transactions for multi-step operations**
3. **Never expose raw SQL in frontend**
4. **Validate input at multiple layers**
5. **Use prepared statements to prevent SQL injection**
6. **Index foreign keys for query performance**
7. **Monitor query performance regularly**

---

## Future Enhancements

Potential additions for future versions:

1. **Activity Logs**: Audit trail for all changes
2. **File Attachments**: Link files to projects/tasks
3. **Comments**: Threaded comments on tasks
4. **Time Tracking**: Actual time spent on tasks
5. **Notifications**: User notification system
6. **Tags**: Flexible tagging system
7. **Custom Fields**: User-defined fields

---

## Database Maintenance

### Cleanup Old Reset Tokens

```sql
DELETE FROM password_reset_tokens
WHERE expires_at < NOW() - INTERVAL '7 days';
```

### Update Timestamps

Consider using triggers to auto-update `updated_at`:

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
```

---

*Last Updated: 2026-01-13*
