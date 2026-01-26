import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import pg from 'pg'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { emailService } from './services/emailService.js'

config()

const app = express()
const PORT = process.env.PORT || 3333
const HOST = process.env.HOST || '0.0.0.0'

// Database connection pool
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'pfs_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'pfs_automation',
})

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}))
app.use(express.json())

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect()
  try {
    console.log('🔧 Initializing database schema...')

    // ============================================
    // 1. Create users table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        user_type VARCHAR(50) NOT NULL DEFAULT 'actor',
        preferred_language VARCHAR(10) DEFAULT 'en',
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT check_user_type CHECK (user_type IN ('administrator', 'project_manager', 'actor')),
        CONSTRAINT check_preferred_language CHECK (preferred_language IN ('en', 'fr', 'es', 'de'))
      )
    `)

    // Create indexes for users table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)
    `)

    console.log('  ✓ Users table ready')

    // Create setup_statuses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS setup_statuses (
        id SERIAL PRIMARY KEY,
        is_setup_complete BOOLEAN DEFAULT FALSE NOT NULL,
        setup_completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `)

    // Insert initial setup status if not exists
    await client.query(`
      INSERT INTO setup_statuses (is_setup_complete, created_at, updated_at)
      SELECT FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      WHERE NOT EXISTS (SELECT 1 FROM setup_statuses)
    `)

    // Create password_reset_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `)

    // Create index on token for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
      ON password_reset_tokens(token)
    `)

    // Create index on expires_at for cleanup
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
      ON password_reset_tokens(expires_at)
    `)

    console.log('  ✓ Password reset tokens table ready')

    // ============================================
    // 4. Create clients table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        client_name VARCHAR(255) NOT NULL,
        contact_first_name VARCHAR(255),
        contact_last_name VARCHAR(255),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        address TEXT,
        city VARCHAR(255),
        country VARCHAR(100),
        postal_code VARCHAR(20),
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_client_name ON clients(client_name)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active)
    `)

    console.log('  ✓ Clients table ready')

    // ============================================
    // 5. Create project_types table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_types (
        id SERIAL PRIMARY KEY,
        type_name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `)

    // Seed default project types if table is empty
    await client.query(`
      INSERT INTO project_types (type_name, description, display_order)
      SELECT * FROM (VALUES
        ('Days Pool', 'Time-based billing with a pool of available days', 1),
        ('Fixed Price', 'Fixed price contract for defined deliverables', 2),
        ('T&M', 'Time and Materials billing', 3)
      ) AS v(type_name, description, display_order)
      WHERE NOT EXISTS (SELECT 1 FROM project_types)
    `)

    console.log('  ✓ Project types table ready')

    // ============================================
    // 6. Create projects table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
        project_manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        country VARCHAR(100),
        status VARCHAR(50) NOT NULL DEFAULT 'created',
        start_date DATE,
        end_date DATE,
        description TEXT,
        budget DECIMAL(15, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT check_project_status CHECK (status IN ('created', 'in_progress', 'frozen', 'closed'))
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON projects(project_manager_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects(start_date)
    `)

    console.log('  ✓ Projects table ready')

    // Add 'archived' status to projects constraint (migration for soft delete)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'check_project_status' AND table_name = 'projects'
        ) THEN
          ALTER TABLE projects DROP CONSTRAINT check_project_status;
        END IF;
        ALTER TABLE projects ADD CONSTRAINT check_project_status
          CHECK (status IN ('created', 'in_progress', 'frozen', 'closed', 'archived'));
      END $$;
    `)

    // Add project_type_id column to projects (migration)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'project_type_id'
        ) THEN
          ALTER TABLE projects ADD COLUMN project_type_id INTEGER REFERENCES project_types(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS idx_projects_project_type_id ON projects(project_type_id);
        END IF;
      END $$;
    `)

    // Add erp_ref column to projects (migration)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'erp_ref'
        ) THEN
          ALTER TABLE projects ADD COLUMN erp_ref VARCHAR(100);
        END IF;
      END $$;
    `)

    // ============================================
    // 7. Create project_users table (N-N)
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_users (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        role VARCHAR(100),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(project_id, user_id)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_users_project_id ON project_users(project_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_project_users_user_id ON project_users(user_id)
    `)

    console.log('  ✓ Project users table ready')

    // ============================================
    // 7. Create stages table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS stages (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        stage_name VARCHAR(255) NOT NULL,
        stage_order INTEGER DEFAULT 0 NOT NULL,
        start_date DATE,
        end_date DATE,
        description TEXT,
        is_completed BOOLEAN DEFAULT FALSE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        UNIQUE(project_id, stage_order)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stages_project_id ON stages(project_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_stages_stage_order ON stages(project_id, stage_order)
    `)

    console.log('  ✓ Stages table ready')

    // ============================================
    // 8. Create tasks table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        stage_id INTEGER REFERENCES stages(id) ON DELETE RESTRICT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        task_name VARCHAR(255) NOT NULL,
        description TEXT,
        sold_days DECIMAL(10, 2) DEFAULT 0 NOT NULL,
        responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        priority VARCHAR(50) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'todo',
        display_order INTEGER DEFAULT 0 NOT NULL,
        start_date DATE,
        due_date DATE,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT check_task_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
        CONSTRAINT check_task_status CHECK (status IN ('todo', 'in_progress', 'review', 'done', 'blocked')),
        CONSTRAINT check_sold_days CHECK (sold_days >= 0)
      )
    `)

    // Add display_order column if it doesn't exist (for existing tables)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'display_order') THEN
          ALTER TABLE tasks ADD COLUMN display_order INTEGER DEFAULT 0 NOT NULL;
        END IF;
      END $$;
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_stage_id ON tasks(stage_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_responsible_id ON tasks(responsible_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_display_order ON tasks(stage_id, display_order)
    `)

    console.log('  ✓ Tasks table ready (with subtasks support)')

    // ============================================
    // 7. Create timesheet_entries table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS timesheet_entries (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        hours DECIMAL(5, 2) NOT NULL DEFAULT 0,
        description TEXT,
        entered_by INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT check_hours CHECK (hours >= 0 AND hours <= 24),
        CONSTRAINT unique_user_task_date UNIQUE (user_id, task_id, date)
      )
    `)

    // Create indexes for timesheet_entries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_user_id ON timesheet_entries(user_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_task_id ON timesheet_entries(task_id)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_date ON timesheet_entries(date)
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_user_date ON timesheet_entries(user_id, date)
    `)

    console.log('  ✓ Timesheet entries table ready')

    // ============================================
    // 8. Create timesheet_locks table
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS timesheet_locks (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        locked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT check_month CHECK (month >= 1 AND month <= 12),
        CONSTRAINT unique_project_year_month UNIQUE (project_id, year, month)
      )
    `)

    // Create index for timesheet_locks
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_timesheet_locks_year_month ON timesheet_locks(year, month)
    `)

    console.log('  ✓ Timesheet locks table ready')

    // ============================================
    // 9. Add remaining_hours column to tasks if not exists
    // ============================================
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'remaining_hours') THEN
          ALTER TABLE tasks ADD COLUMN remaining_hours DECIMAL(10, 2);
        END IF;
      END $$
    `)

    console.log('  ✓ Tasks remaining_hours column ready')

    // ============================================
    // 9b. Add last_remaining_update_total column to tasks if not exists
    // ============================================
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'last_remaining_update_total') THEN
          ALTER TABLE tasks ADD COLUMN last_remaining_update_total DECIMAL(10, 2);
        END IF;
      END $$
    `)

    console.log('  ✓ Tasks last_remaining_update_total column ready')

    // ============================================
    // 10. Add daily_work_hours column to users if not exists
    // ============================================
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'daily_work_hours') THEN
          ALTER TABLE users ADD COLUMN daily_work_hours DECIMAL(4, 2) DEFAULT 8.0;
        END IF;
      END $$
    `)

    console.log('  ✓ Users daily_work_hours column ready')

    // ============================================
    // 11. Create user_settings table for user preferences
    // ============================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT unique_user_setting UNIQUE (user_id, setting_key)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)
    `)

    console.log('  ✓ User settings table ready')

    console.log('✅ Database schema initialized successfully')
  } catch (error) {
    console.error('Database initialization error:', error)
  } finally {
    client.release()
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'pfs-automation-backend'
  })
})

// Get user projects based on role
app.get('/api/users/:userId/projects', async (req, res) => {
  try {
    const { userId } = req.params

    // Get user info to check role
    const userResult = await pool.query(
      'SELECT id, user_type FROM users WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = userResult.rows[0]

    let projectsQuery: string
    let queryParams: any[]

    if (user.user_type === 'administrator') {
      // Administrator: get ALL projects
      projectsQuery = `
        SELECT
          p.*,
          c.client_name,
          u.username as project_manager_username,
          u.first_name as project_manager_first_name,
          u.last_name as project_manager_last_name,
          pt.type_name as project_type_name,
          COUNT(DISTINCT pu.user_id) as team_size,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks,
          COALESCE(SUM(t.sold_days), 0) as total_sold_days,
          COALESCE(SUM(t.remaining_hours), 0) as total_remaining_hours,
          COALESCE((
            SELECT SUM(te.hours)
            FROM timesheet_entries te
            JOIN tasks t2 ON te.task_id = t2.id
            WHERE t2.project_id = p.id
          ), 0) as total_hours_spent
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN project_types pt ON p.project_type_id = pt.id
        LEFT JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN tasks t ON p.id = t.project_id AND t.parent_task_id IS NULL
        WHERE p.status IN ('created', 'in_progress')
        GROUP BY p.id, c.client_name, u.username, u.first_name, u.last_name, pt.type_name
        ORDER BY p.created_at DESC
      `
      queryParams = []
    } else if (user.user_type === 'project_manager') {
      // Project Manager: get only projects where user is PM
      projectsQuery = `
        SELECT
          p.*,
          c.client_name,
          u.username as project_manager_username,
          u.first_name as project_manager_first_name,
          u.last_name as project_manager_last_name,
          pt.type_name as project_type_name,
          COUNT(DISTINCT pu.user_id) as team_size,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks,
          COALESCE(SUM(t.sold_days), 0) as total_sold_days,
          COALESCE(SUM(t.remaining_hours), 0) as total_remaining_hours,
          COALESCE((
            SELECT SUM(te.hours)
            FROM timesheet_entries te
            JOIN tasks t2 ON te.task_id = t2.id
            WHERE t2.project_id = p.id
          ), 0) as total_hours_spent
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN project_types pt ON p.project_type_id = pt.id
        LEFT JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN tasks t ON p.id = t.project_id AND t.parent_task_id IS NULL
        WHERE p.project_manager_id = $1 AND p.status IN ('created', 'in_progress')
        GROUP BY p.id, c.client_name, u.username, u.first_name, u.last_name, pt.type_name
        ORDER BY p.created_at DESC
      `
      queryParams = [userId]
    } else {
      // Actor: get projects where user is assigned
      projectsQuery = `
        SELECT
          p.*,
          c.client_name,
          u.username as project_manager_username,
          u.first_name as project_manager_first_name,
          u.last_name as project_manager_last_name,
          pt.type_name as project_type_name,
          COUNT(DISTINCT pu.user_id) as team_size,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks,
          COALESCE(SUM(t.sold_days), 0) as total_sold_days,
          COALESCE(SUM(t.remaining_hours), 0) as total_remaining_hours,
          COALESCE((
            SELECT SUM(te.hours)
            FROM timesheet_entries te
            JOIN tasks t2 ON te.task_id = t2.id
            WHERE t2.project_id = p.id
          ), 0) as total_hours_spent
        FROM projects p
        INNER JOIN project_users pu_filter ON p.id = pu_filter.project_id AND pu_filter.user_id = $1
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN project_types pt ON p.project_type_id = pt.id
        LEFT JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN tasks t ON p.id = t.project_id AND t.parent_task_id IS NULL
        WHERE p.status IN ('created', 'in_progress')
        GROUP BY p.id, c.client_name, u.username, u.first_name, u.last_name, pt.type_name
        ORDER BY p.created_at DESC
      `
      queryParams = [userId]
    }

    const projects = await pool.query(projectsQuery, queryParams)

    res.json({
      projects: projects.rows,
      userType: user.user_type
    })
  } catch (error) {
    console.error('Get user projects error:', error)
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

// Get all clients
app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, client_name FROM clients ORDER BY client_name ASC'
    )
    res.json({ clients: result.rows })
  } catch (error) {
    console.error('Get clients error:', error)
    res.status(500).json({ error: 'Failed to fetch clients' })
  }
})

// Create a new client
app.post('/api/clients', async (req, res) => {
  const { client_name } = req.body

  if (!client_name || !client_name.trim()) {
    return res.status(400).json({ error: 'Client name is required' })
  }

  try {
    // Check if client already exists
    const existing = await pool.query(
      'SELECT id FROM clients WHERE LOWER(client_name) = LOWER($1)',
      [client_name.trim()]
    )

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A client with this name already exists' })
    }

    const result = await pool.query(
      'INSERT INTO clients (client_name) VALUES ($1) RETURNING id, client_name',
      [client_name.trim()]
    )

    res.status(201).json({ client: result.rows[0] })
  } catch (error) {
    console.error('Create client error:', error)
    res.status(500).json({ error: 'Failed to create client' })
  }
})

// Get all project types
app.get('/api/project-types', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, type_name, description FROM project_types WHERE is_active = true ORDER BY display_order ASC'
    )
    res.json({ projectTypes: result.rows })
  } catch (error) {
    console.error('Get project types error:', error)
    res.status(500).json({ error: 'Failed to fetch project types' })
  }
})

// Get all project managers (users with project_manager or administrator role)
app.get('/api/users/project-managers', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, email
       FROM users
       WHERE user_type IN ('project_manager', 'administrator')
       ORDER BY first_name ASC, last_name ASC`
    )
    res.json({ projectManagers: result.rows })
  } catch (error) {
    console.error('Get project managers error:', error)
    res.status(500).json({ error: 'Failed to fetch project managers' })
  }
})

// Create a new project
app.post('/api/projects', async (req, res) => {
  const { project_name, client_id, project_manager_id, description } = req.body

  if (!project_name || !client_id || !project_manager_id) {
    return res.status(400).json({ error: 'Project name, client, and project manager are required' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO projects (project_name, client_id, project_manager_id, description, status, created_at)
       VALUES ($1, $2, $3, $4, 'created', CURRENT_TIMESTAMP)
       RETURNING id, project_name, client_id, project_manager_id, description, status, created_at`,
      [project_name, client_id, project_manager_id, description || null]
    )

    // Also add the project manager to project_users table
    await pool.query(
      `INSERT INTO project_users (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [result.rows[0].id, project_manager_id]
    )

    res.status(201).json({ project: result.rows[0] })
  } catch (error) {
    console.error('Create project error:', error)
    res.status(500).json({ error: 'Failed to create project' })
  }
})

// Update project
app.put('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params
  const { project_name, description, status, project_type_id, erp_ref } = req.body

  // Validate status if provided (archived is not allowed via update)
  const validStatuses = ['created', 'in_progress', 'frozen', 'closed']
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Allowed: created, in_progress, frozen, closed' })
  }

  try {
    // Check if project exists
    const existingProject = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId])
    if (existingProject.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // Validate project_type_id if provided
    if (project_type_id !== undefined && project_type_id !== null) {
      const typeExists = await pool.query('SELECT id FROM project_types WHERE id = $1 AND is_active = true', [project_type_id])
      if (typeExists.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid project type' })
      }
    }

    // Build dynamic update
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (project_name !== undefined) {
      updates.push(`project_name = $${paramIndex++}`)
      values.push(project_name)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`)
      values.push(description)
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`)
      values.push(status)
    }
    if (project_type_id !== undefined) {
      updates.push(`project_type_id = $${paramIndex++}`)
      values.push(project_type_id)
    }
    if (erp_ref !== undefined) {
      updates.push(`erp_ref = $${paramIndex++}`)
      values.push(erp_ref)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`)
    values.push(projectId)

    const result = await pool.query(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING *`,
      values
    )

    // Get full project details with joins
    const projectResult = await pool.query(
      `SELECT p.*, c.client_name,
              u.username as pm_username, u.first_name as pm_first_name, u.last_name as pm_last_name,
              pt.type_name as project_type_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users u ON p.project_manager_id = u.id
       LEFT JOIN project_types pt ON p.project_type_id = pt.id
       WHERE p.id = $1`,
      [projectId]
    )

    res.json({ project: projectResult.rows[0] })
  } catch (error) {
    console.error('Update project error:', error)
    res.status(500).json({ error: 'Failed to update project' })
  }
})

// Soft delete project (requires password confirmation)
app.delete('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params
  const { user_id, password } = req.body

  if (!user_id || !password) {
    return res.status(400).json({ error: 'User ID and password are required for deletion' })
  }

  try {
    // 1. Verify user exists and get their password hash
    const userResult = await pool.query(
      'SELECT id, password, user_type FROM users WHERE id = $1 AND is_active = TRUE',
      [user_id]
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    // 2. Verify the password
    const isValidPassword = await bcrypt.compare(password, userResult.rows[0].password)
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' })
    }

    // 3. Check if project exists and get PM
    const projectResult = await pool.query(
      'SELECT id, project_manager_id, status FROM projects WHERE id = $1',
      [projectId]
    )

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' })
    }

    if (projectResult.rows[0].status === 'archived') {
      return res.status(400).json({ error: 'Project is already archived' })
    }

    // 4. Check permissions (admin or PM of the project)
    const userType = userResult.rows[0].user_type
    const isPM = projectResult.rows[0].project_manager_id === parseInt(user_id)

    if (userType !== 'administrator' && !isPM) {
      return res.status(403).json({ error: 'Not authorized to archive this project' })
    }

    // 5. Soft delete: set status to 'archived'
    await pool.query(
      `UPDATE projects SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [projectId]
    )

    res.json({ message: 'Project archived successfully' })
  } catch (error) {
    console.error('Delete project error:', error)
    res.status(500).json({ error: 'Failed to archive project' })
  }
})

// Get project details with stages, tasks and subtasks
app.get('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params

  try {
    // Get project details
    const projectResult = await pool.query(
      `SELECT p.*, c.client_name,
              u.username as pm_username, u.first_name as pm_first_name, u.last_name as pm_last_name,
              pt.type_name as project_type_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users u ON p.project_manager_id = u.id
       LEFT JOIN project_types pt ON p.project_type_id = pt.id
       WHERE p.id = $1`,
      [projectId]
    )

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' })
    }

    const project = projectResult.rows[0]

    // Get stages for this project
    const stagesResult = await pool.query(
      `SELECT s.*,
              COUNT(DISTINCT t.id) FILTER (WHERE t.parent_task_id IS NULL) as task_count,
              COUNT(DISTINCT t.id) FILTER (WHERE t.parent_task_id IS NULL AND t.status = 'done') as completed_task_count
       FROM stages s
       LEFT JOIN tasks t ON s.id = t.stage_id
       WHERE s.project_id = $1
       GROUP BY s.id
       ORDER BY s.stage_order ASC`,
      [projectId]
    )

    // Get all tasks for this project (including subtasks)
    const tasksResult = await pool.query(
      `SELECT t.*,
              u.username as assigned_username, u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM tasks t
       LEFT JOIN users u ON t.responsible_id = u.id
       WHERE t.project_id = $1
       ORDER BY t.stage_id ASC, t.parent_task_id ASC NULLS FIRST, t.display_order ASC, t.id ASC`,
      [projectId]
    )

    // Organize tasks into hierarchy
    const tasksMap = new Map()
    const rootTasks: any[] = []

    // First pass: create all task objects
    tasksResult.rows.forEach((task: any) => {
      tasksMap.set(task.id, { ...task, subtasks: [] })
    })

    // Second pass: build hierarchy
    tasksResult.rows.forEach((task: any) => {
      const taskObj = tasksMap.get(task.id)
      if (task.parent_task_id) {
        const parent = tasksMap.get(task.parent_task_id)
        if (parent) {
          parent.subtasks.push(taskObj)
        }
      } else {
        rootTasks.push(taskObj)
      }
    })

    // Group root tasks by stage
    const stages = stagesResult.rows.map((stage: any) => ({
      ...stage,
      tasks: rootTasks.filter(task => task.stage_id === stage.id)
    }))

    // Get tasks without stage (if any)
    const unstagedTasks = rootTasks.filter(task => !task.stage_id)

    res.json({
      project,
      stages,
      unstagedTasks
    })
  } catch (error) {
    console.error('Get project details error:', error)
    res.status(500).json({ error: 'Failed to fetch project details' })
  }
})

// Get project timesheet data aggregated by task and week
app.get('/api/projects/:projectId/timesheet-summary', async (req, res) => {
  const { projectId } = req.params

  try {
    // Get all timesheet entries for this project, grouped by task and week (Monday start)
    // Use date_trunc with 'week' which starts on Monday in ISO weeks
    const result = await pool.query(
      `SELECT
        te.task_id,
        TO_CHAR(DATE_TRUNC('week', te.date), 'YYYY-MM-DD') as week_start,
        SUM(te.hours) as total_hours
       FROM timesheet_entries te
       JOIN tasks t ON te.task_id = t.id
       WHERE t.project_id = $1
       GROUP BY te.task_id, DATE_TRUNC('week', te.date)
       ORDER BY te.task_id, week_start`,
      [projectId]
    )

    // Transform to a map: { taskId: { weekStart: hours } }
    const timesheetByTask: Record<number, Record<string, number>> = {}
    for (const row of result.rows) {
      if (!timesheetByTask[row.task_id]) {
        timesheetByTask[row.task_id] = {}
      }
      // week_start is already formatted as YYYY-MM-DD string
      timesheetByTask[row.task_id][row.week_start] = parseFloat(row.total_hours)
    }

    res.json({ timesheetByTask })
  } catch (error) {
    console.error('Get project timesheet summary error:', error)
    res.status(500).json({ error: 'Failed to fetch project timesheet summary' })
  }
})

// ============================================
// STAGES CRUD
// ============================================

// Create a new stage
app.post('/api/projects/:projectId/stages', async (req, res) => {
  const { projectId } = req.params
  const { stage_name, description } = req.body

  if (!stage_name || !stage_name.trim()) {
    return res.status(400).json({ error: 'Stage name is required' })
  }

  try {
    // Get the next stage_order
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(stage_order), -1) + 1 as next_order FROM stages WHERE project_id = $1',
      [projectId]
    )
    const nextOrder = orderResult.rows[0].next_order

    const result = await pool.query(
      `INSERT INTO stages (project_id, stage_name, stage_order, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, stage_name.trim(), nextOrder, description || null]
    )

    res.status(201).json({ stage: result.rows[0] })
  } catch (error) {
    console.error('Create stage error:', error)
    res.status(500).json({ error: 'Failed to create stage' })
  }
})

// Update a stage
app.put('/api/stages/:stageId', async (req, res) => {
  const { stageId } = req.params
  const { stage_name, description, start_date, end_date } = req.body

  try {
    // Build update query dynamically to allow clearing values
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (stage_name !== undefined) {
      updates.push(`stage_name = $${paramCount++}`)
      values.push(stage_name)
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`)
      values.push(description || null)
    }
    if (start_date !== undefined) {
      updates.push(`start_date = $${paramCount++}`)
      values.push(start_date || null)
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${paramCount++}`)
      values.push(end_date || null)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`)
    values.push(stageId)

    const result = await pool.query(
      `UPDATE stages SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stage not found' })
    }

    res.json({ stage: result.rows[0] })
  } catch (error) {
    console.error('Update stage error:', error)
    res.status(500).json({ error: 'Failed to update stage' })
  }
})

// Delete a stage
app.delete('/api/stages/:stageId', async (req, res) => {
  const { stageId } = req.params

  try {
    // Check if stage has tasks
    const tasksCheck = await pool.query(
      'SELECT COUNT(*) as count FROM tasks WHERE stage_id = $1',
      [stageId]
    )

    if (parseInt(tasksCheck.rows[0].count) > 0) {
      return res.status(400).json({
        error: 'Cannot delete stage with tasks. Move or delete tasks first.'
      })
    }

    const result = await pool.query(
      'DELETE FROM stages WHERE id = $1 RETURNING id',
      [stageId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stage not found' })
    }

    res.json({ message: 'Stage deleted successfully' })
  } catch (error) {
    console.error('Delete stage error:', error)
    res.status(500).json({ error: 'Failed to delete stage' })
  }
})

// ============================================
// TASKS CRUD
// ============================================

// Create a new task
app.post('/api/projects/:projectId/tasks', async (req, res) => {
  const { projectId } = req.params
  const { task_name, stage_id, parent_task_id, description, priority, responsible_id, sold_days } = req.body

  if (!task_name || !task_name.trim()) {
    return res.status(400).json({ error: 'Task name is required' })
  }

  try {
    // Get the next display_order for this context (stage or parent task)
    let orderQuery
    let orderParams

    if (parent_task_id) {
      orderQuery = 'SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM tasks WHERE parent_task_id = $1'
      orderParams = [parent_task_id]
    } else if (stage_id) {
      orderQuery = 'SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM tasks WHERE stage_id = $1 AND parent_task_id IS NULL'
      orderParams = [stage_id]
    } else {
      orderQuery = 'SELECT COALESCE(MAX(display_order), -1) + 1 as next_order FROM tasks WHERE project_id = $1 AND stage_id IS NULL AND parent_task_id IS NULL'
      orderParams = [projectId]
    }

    const orderResult = await pool.query(orderQuery, orderParams)
    const nextOrder = orderResult.rows[0].next_order

    const result = await pool.query(
      `INSERT INTO tasks (project_id, stage_id, parent_task_id, task_name, description, priority, responsible_id, sold_days, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        projectId,
        stage_id || null,
        parent_task_id || null,
        task_name.trim(),
        description || null,
        priority || 'medium',
        responsible_id || null,
        sold_days || 0,
        nextOrder
      ]
    )

    // Fetch the task with user info
    const taskWithUser = await pool.query(
      `SELECT t.*, u.username as assigned_username, u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM tasks t
       LEFT JOIN users u ON t.responsible_id = u.id
       WHERE t.id = $1`,
      [result.rows[0].id]
    )

    res.status(201).json({ task: { ...taskWithUser.rows[0], subtasks: [] } })
  } catch (error) {
    console.error('Create task error:', error)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// Update a task
app.put('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params
  const { task_name, priority, status, sold_days } = req.body
  // These fields can be explicitly set to null
  const hasDescription = 'description' in req.body
  const description = req.body.description
  const hasResponsibleId = 'responsible_id' in req.body
  const responsible_id = req.body.responsible_id
  const hasStartDate = 'start_date' in req.body
  const start_date = req.body.start_date
  const hasDueDate = 'due_date' in req.body
  const due_date = req.body.due_date
  const hasStageId = 'stage_id' in req.body
  const stage_id = req.body.stage_id

  try {
    // Handle completed_at based on status
    let completedAt = null
    if (status === 'done') {
      const currentTask = await pool.query('SELECT status FROM tasks WHERE id = $1', [taskId])
      if (currentTask.rows.length > 0 && currentTask.rows[0].status !== 'done') {
        completedAt = new Date()
      }
    }

    const result = await pool.query(
      `UPDATE tasks
       SET task_name = COALESCE($1, task_name),
           description = CASE WHEN $2 THEN $3 ELSE description END,
           priority = COALESCE($4, priority),
           status = COALESCE($5, status),
           responsible_id = CASE WHEN $6 THEN $7 ELSE responsible_id END,
           sold_days = COALESCE($8, sold_days),
           start_date = CASE WHEN $9 THEN $10 ELSE start_date END,
           due_date = CASE WHEN $11 THEN $12 ELSE due_date END,
           stage_id = CASE WHEN $13 THEN $14 ELSE stage_id END,
           completed_at = CASE WHEN $5 = 'done' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15
       RETURNING *`,
      [task_name, hasDescription, description, priority, status, hasResponsibleId, responsible_id, sold_days, hasStartDate, start_date, hasDueDate, due_date, hasStageId, stage_id, taskId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // Fetch the task with user info
    const taskWithUser = await pool.query(
      `SELECT t.*, u.username as assigned_username, u.first_name as assigned_first_name, u.last_name as assigned_last_name
       FROM tasks t
       LEFT JOIN users u ON t.responsible_id = u.id
       WHERE t.id = $1`,
      [taskId]
    )

    res.json({ task: taskWithUser.rows[0] })
  } catch (error) {
    console.error('Update task error:', error)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// Delete a task (and its subtasks via CASCADE)
app.delete('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params

  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 RETURNING id',
      [taskId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    res.json({ message: 'Task deleted successfully' })
  } catch (error) {
    console.error('Delete task error:', error)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

// Get all users for task assignment
app.get('/api/users/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, email, user_type
       FROM users
       WHERE is_active = TRUE
       ORDER BY first_name ASC, last_name ASC`
    )
    res.json({ users: result.rows })
  } catch (error) {
    console.error('Get all users error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// ============================================
// USERS CRUD (Admin only)
// ============================================

// Get all users (including inactive) for admin management
app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, email, user_type, daily_work_hours, is_active, created_at, last_login_at
       FROM users
       ORDER BY created_at DESC`
    )
    res.json({ users: result.rows })
  } catch (error) {
    console.error('Get all users (admin) error:', error)
    res.status(500).json({ error: 'Failed to fetch users' })
  }
})

// Create a new user
app.post('/api/admin/users', async (req, res) => {
  const { email, username, password, first_name, last_name, user_type, daily_work_hours } = req.body

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Email, username, and password are required' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' })
  }

  const validUserTypes = ['administrator', 'project_manager', 'actor']
  if (user_type && !validUserTypes.includes(user_type)) {
    return res.status(400).json({ error: 'Invalid user type' })
  }

  // Validate daily_work_hours if provided
  if (daily_work_hours !== undefined) {
    const hours = parseFloat(daily_work_hours)
    if (isNaN(hours) || hours < 1 || hours > 24) {
      return res.status(400).json({ error: 'Daily work hours must be between 1 and 24' })
    }
  }

  try {
    // Check if email or username already exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    )

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email or username already exists' })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    const result = await pool.query(
      `INSERT INTO users (email, username, password, first_name, last_name, user_type, daily_work_hours, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, email, username, first_name, last_name, user_type, daily_work_hours, is_active, created_at`,
      [email, username, hashedPassword, first_name || null, last_name || null, user_type || 'actor', daily_work_hours || 8.0]
    )

    res.status(201).json({ user: result.rows[0] })
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Update a user
app.put('/api/admin/users/:userId', async (req, res) => {
  const { userId } = req.params
  const { email, username, password, first_name, last_name, user_type, is_active, daily_work_hours } = req.body

  // Validate daily_work_hours if provided
  if (daily_work_hours !== undefined) {
    const hours = parseFloat(daily_work_hours)
    if (isNaN(hours) || hours < 1 || hours > 24) {
      return res.status(400).json({ error: 'Daily work hours must be between 1 and 24' })
    }
  }

  try {
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId])
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check for email/username conflicts
    if (email || username) {
      const existing = await pool.query(
        'SELECT id FROM users WHERE (email = $1 OR username = $2) AND id != $3',
        [email, username, userId]
      )
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email or username already exists' })
      }
    }

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramCount = 1

    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`)
      values.push(email)
    }
    if (username !== undefined) {
      updates.push(`username = $${paramCount++}`)
      values.push(username)
    }
    if (password !== undefined) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' })
      }
      const hashedPassword = await bcrypt.hash(password, 10)
      updates.push(`password = $${paramCount++}`)
      values.push(hashedPassword)
    }
    if (first_name !== undefined) {
      updates.push(`first_name = $${paramCount++}`)
      values.push(first_name || null)
    }
    if (last_name !== undefined) {
      updates.push(`last_name = $${paramCount++}`)
      values.push(last_name || null)
    }
    if (user_type !== undefined) {
      const validUserTypes = ['administrator', 'project_manager', 'actor']
      if (!validUserTypes.includes(user_type)) {
        return res.status(400).json({ error: 'Invalid user type' })
      }
      updates.push(`user_type = $${paramCount++}`)
      values.push(user_type)
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`)
      values.push(is_active)
    }
    if (daily_work_hours !== undefined) {
      updates.push(`daily_work_hours = $${paramCount++}`)
      values.push(daily_work_hours)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`)
    values.push(userId)

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, username, first_name, last_name, user_type, daily_work_hours, is_active, created_at`,
      values
    )

    res.json({ user: result.rows[0] })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Delete a user (soft delete - deactivate)
app.delete('/api/admin/users/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    // Check if user exists
    const userCheck = await pool.query('SELECT id, user_type FROM users WHERE id = $1', [userId])
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if this is the last administrator
    if (userCheck.rows[0].user_type === 'administrator') {
      const adminCount = await pool.query(
        "SELECT COUNT(*) as count FROM users WHERE user_type = 'administrator' AND is_active = TRUE"
      )
      if (parseInt(adminCount.rows[0].count) <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last administrator' })
      }
    }

    // Soft delete (deactivate)
    await pool.query(
      'UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    )

    res.json({ message: 'User deactivated successfully' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

// Reorder stages within a project
app.put('/api/projects/:projectId/stages/reorder', async (req, res) => {
  const { projectId } = req.params
  const { stageIds } = req.body // Array of stage IDs in new order

  if (!Array.isArray(stageIds) || stageIds.length === 0) {
    return res.status(400).json({ error: 'stageIds array is required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Update stage_order for each stage
    for (let i = 0; i < stageIds.length; i++) {
      await client.query(
        `UPDATE stages SET stage_order = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND project_id = $3`,
        [i, stageIds[i], projectId]
      )
    }

    await client.query('COMMIT')
    res.json({ message: 'Stages reordered successfully' })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Reorder stages error:', error)
    res.status(500).json({ error: 'Failed to reorder stages' })
  } finally {
    client.release()
  }
})

// Reorder tasks within a stage (or move between stages)
app.put('/api/stages/:stageId/tasks/reorder', async (req, res) => {
  const { stageId } = req.params
  const { taskIds } = req.body // Array of task IDs in new order

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return res.status(400).json({ error: 'taskIds array is required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Update display_order and stage_id for each task
    for (let i = 0; i < taskIds.length; i++) {
      await client.query(
        `UPDATE tasks SET display_order = $1, stage_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [i, stageId === 'null' ? null : parseInt(stageId), taskIds[i]]
      )
    }

    await client.query('COMMIT')
    res.json({ message: 'Tasks reordered successfully' })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Reorder tasks error:', error)
    res.status(500).json({ error: 'Failed to reorder tasks' })
  } finally {
    client.release()
  }
})

// Reorder subtasks within a parent task
app.put('/api/tasks/:taskId/subtasks/reorder', async (req, res) => {
  const { taskId } = req.params
  const { subtaskIds } = req.body // Array of subtask IDs in new order

  if (!Array.isArray(subtaskIds) || subtaskIds.length === 0) {
    return res.status(400).json({ error: 'subtaskIds array is required' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Update display_order for each subtask
    for (let i = 0; i < subtaskIds.length; i++) {
      await client.query(
        `UPDATE tasks SET display_order = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND parent_task_id = $3`,
        [i, subtaskIds[i], taskId]
      )
    }

    await client.query('COMMIT')
    res.json({ message: 'Subtasks reordered successfully' })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Reorder subtasks error:', error)
    res.status(500).json({ error: 'Failed to reorder subtasks' })
  } finally {
    client.release()
  }
})

// Setup status endpoint
app.get('/api/setup/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT is_setup_complete, setup_completed_at FROM setup_statuses LIMIT 1')

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Setup status not initialized' })
    }

    res.json({
      isSetupComplete: result.rows[0].is_setup_complete,
      setupCompletedAt: result.rows[0].setup_completed_at
    })
  } catch (error) {
    console.error('Setup status error:', error)
    res.status(500).json({ error: 'Failed to check setup status' })
  }
})

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    // Find user by username or email
    const result = await pool.query(
      'SELECT id, email, username, password, first_name, last_name, user_type, is_active FROM users WHERE (username = $1 OR email = $1) AND is_active = TRUE',
      [username]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = result.rows[0]

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Update last_login_at timestamp
    await pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    )

    // Don't send password back to client
    const { password: _, ...userWithoutPassword } = user

    res.json({
      message: 'Login successful',
      user: userWithoutPassword
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// Forgot password endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
  const client = await pool.connect()

  try {
    const { identifier } = req.body // Can be email or username

    if (!identifier) {
      return res.status(400).json({ error: 'Email or username is required' })
    }

    // Find user by email or username
    const userResult = await client.query(
      'SELECT id, email, username, first_name, is_active FROM users WHERE (email = $1 OR username = $1) AND is_active = TRUE',
      [identifier]
    )

    // Always return success to prevent user enumeration attacks
    if (userResult.rows.length === 0) {
      return res.json({
        message: 'If an account with that email/username exists, you will receive a password reset link.'
      })
    }

    const user = userResult.rows[0]

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex')

    // Set expiration to 1 hour from now
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Store token in database
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [user.id, token, expiresAt]
    )

    // Send password reset email
    await emailService.sendPasswordResetEmail(
      user.email,
      user.first_name || user.username,
      token
    )

    res.json({
      message: 'If an account with that email/username exists, you will receive a password reset link.'
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ error: 'Failed to process password reset request' })
  } finally {
    client.release()
  }
})

// Reset password endpoint
app.post('/api/auth/reset-password', async (req, res) => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Token and new password are required' })
    }

    if (newPassword.length < 8) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Password must be at least 8 characters long' })
    }

    // Find valid token
    const tokenResult = await client.query(
      `SELECT user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    )

    if (tokenResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Invalid or expired reset token' })
    }

    const resetToken = tokenResult.rows[0]

    // Check if token has been used
    if (resetToken.used_at) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'This reset token has already been used' })
    }

    // Check if token has expired
    if (new Date(resetToken.expires_at) < new Date()) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'This reset token has expired' })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update user password
    await client.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, resetToken.user_id]
    )

    // Mark token as used
    await client.query(
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token = $1',
      [token]
    )

    await client.query('COMMIT')

    res.json({ message: 'Password has been reset successfully' })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Reset password error:', error)
    res.status(500).json({ error: 'Failed to reset password' })
  } finally {
    client.release()
  }
})

// Complete setup endpoint
app.post('/api/setup/complete', async (req, res) => {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Check if setup is already complete
    const statusResult = await client.query('SELECT is_setup_complete FROM setup_statuses LIMIT 1')

    if (statusResult.rows.length === 0) {
      throw new Error('Setup status not initialized')
    }

    if (statusResult.rows[0].is_setup_complete) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Setup already completed' })
    }

    // Validate request data
    const { email, username, password, firstName, lastName } = req.body

    if (!email || !username || !password) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Email, username, and password are required' })
    }

    if (password.length < 8) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Password must be at least 8 characters long' })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create admin user
    const userResult = await client.query(
      `INSERT INTO users (email, username, password, first_name, last_name, user_type, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'administrator', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, email, username, user_type`,
      [email, username, hashedPassword, firstName || null, lastName || null]
    )

    // Mark setup as complete
    await client.query(
      `UPDATE setup_statuses
       SET is_setup_complete = TRUE, setup_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`
    )

    await client.query('COMMIT')

    res.status(201).json({
      message: 'Setup completed successfully',
      user: userResult.rows[0]
    })
  } catch (error: any) {
    await client.query('ROLLBACK')
    console.error('Setup error:', error)

    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email or username already exists' })
    }

    res.status(500).json({ error: 'Failed to complete setup' })
  } finally {
    client.release()
  }
})

// ============================================
// TIMESHEET API
// ============================================

// Helper function to check if user can edit timesheet for another user
const canEditTimesheetFor = async (editorId: number, targetUserId: number, taskId: number): Promise<boolean> => {
  // If editing own timesheet, always allowed
  if (editorId === targetUserId) return true

  // Check if editor is admin
  const editorResult = await pool.query('SELECT user_type FROM users WHERE id = $1', [editorId])
  if (editorResult.rows.length === 0) return false
  const editorType = editorResult.rows[0].user_type

  if (editorType === 'administrator') return true

  // Check if editor is project manager of the task's project
  if (editorType === 'project_manager') {
    const taskResult = await pool.query(
      `SELECT p.project_manager_id FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1`,
      [taskId]
    )
    if (taskResult.rows.length > 0 && taskResult.rows[0].project_manager_id === editorId) {
      return true
    }
  }

  return false
}

// Get timesheet data for a user for a specific month
app.get('/api/timesheet', async (req, res) => {
  const { user_id, year, month, view_user_id } = req.query

  if (!user_id || !year || !month) {
    return res.status(400).json({ error: 'user_id, year, and month are required' })
  }

  const requestingUserId = parseInt(user_id as string)
  const targetUserId = view_user_id ? parseInt(view_user_id as string) : requestingUserId
  const yearNum = parseInt(year as string)
  const monthNum = parseInt(month as string)

  try {
    // Check permissions if viewing another user's timesheet
    if (targetUserId !== requestingUserId) {
      const userResult = await pool.query('SELECT user_type FROM users WHERE id = $1', [requestingUserId])
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' })
      }
      const userType = userResult.rows[0].user_type
      if (userType !== 'administrator' && userType !== 'project_manager') {
        return res.status(403).json({ error: 'Not authorized to view other users timesheet' })
      }
    }

    // Get all tasks assigned to the target user in non-closed projects, with total hours
    const tasksResult = await pool.query(
      `SELECT t.id as task_id, t.task_name, t.sold_days, t.remaining_hours, t.last_remaining_update_total,
              p.id as project_id, p.project_name, p.status as project_status,
              s.id as stage_id, s.stage_name,
              COALESCE((SELECT SUM(te.hours) FROM timesheet_entries te WHERE te.task_id = t.id), 0) as total_hours
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN stages s ON t.stage_id = s.id
       WHERE t.responsible_id = $1
         AND p.status != 'closed'
       ORDER BY p.project_name, s.stage_order NULLS LAST, t.display_order`,
      [targetUserId]
    )

    // Get timesheet entries for the month
    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`
    const endDate = new Date(yearNum, monthNum, 0).toISOString().split('T')[0] // Last day of month

    const entriesResult = await pool.query(
      `SELECT te.id, te.task_id, TO_CHAR(te.date, 'YYYY-MM-DD') as date, te.hours, te.description, te.entered_by,
              u.username as entered_by_username
       FROM timesheet_entries te
       LEFT JOIN users u ON te.entered_by = u.id
       WHERE te.user_id = $1
         AND te.date >= $2
         AND te.date <= $3
       ORDER BY te.date`,
      [targetUserId, startDate, endDate]
    )

    // Get locks for projects in the result
    const projectIds = [...new Set(tasksResult.rows.map((t: any) => t.project_id))]
    let locks: any[] = []
    if (projectIds.length > 0) {
      const locksResult = await pool.query(
        `SELECT project_id, year, month, locked_by, locked_at
         FROM timesheet_locks
         WHERE (project_id = ANY($1) OR project_id IS NULL)
           AND year = $2 AND month = $3`,
        [projectIds, yearNum, monthNum]
      )
      locks = locksResult.rows
    }

    // Group tasks by project
    const projectsMap = new Map<number, any>()
    for (const task of tasksResult.rows) {
      if (!projectsMap.has(task.project_id)) {
        projectsMap.set(task.project_id, {
          id: task.project_id,
          name: task.project_name,
          status: task.project_status,
          tasks: []
        })
      }
      projectsMap.get(task.project_id).tasks.push({
        id: task.task_id,
        name: task.task_name,
        stage_id: task.stage_id,
        stage_name: task.stage_name,
        sold_days: parseFloat(task.sold_days) || 0,
        remaining_hours: task.remaining_hours,
        last_remaining_update_total: task.last_remaining_update_total,
        total_hours: parseFloat(task.total_hours)
      })
    }

    res.json({
      user_id: targetUserId,
      year: yearNum,
      month: monthNum,
      projects: Array.from(projectsMap.values()),
      entries: entriesResult.rows,
      locks
    })
  } catch (error) {
    console.error('Get timesheet error:', error)
    res.status(500).json({ error: 'Failed to fetch timesheet' })
  }
})

// Create or update a timesheet entry
app.post('/api/timesheet/entries', async (req, res) => {
  const { user_id, task_id, date, hours, description, entered_by } = req.body

  if (!user_id || !task_id || !date || hours === undefined || !entered_by) {
    return res.status(400).json({ error: 'user_id, task_id, date, hours, and entered_by are required' })
  }

  const hoursNum = parseFloat(hours)
  if (isNaN(hoursNum) || hoursNum < 0 || hoursNum > 24) {
    return res.status(400).json({ error: 'Hours must be between 0 and 24' })
  }

  try {
    // Check permissions
    const canEdit = await canEditTimesheetFor(entered_by, user_id, task_id)
    if (!canEdit) {
      return res.status(403).json({ error: 'Not authorized to edit this timesheet entry' })
    }

    // Check if month is locked for this task's project
    const taskResult = await pool.query(
      'SELECT project_id FROM tasks WHERE id = $1',
      [task_id]
    )
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }
    const projectId = taskResult.rows[0].project_id

    const entryDate = new Date(date)
    const lockResult = await pool.query(
      `SELECT id FROM timesheet_locks
       WHERE (project_id = $1 OR project_id IS NULL)
         AND year = $2 AND month = $3`,
      [projectId, entryDate.getFullYear(), entryDate.getMonth() + 1]
    )
    if (lockResult.rows.length > 0) {
      return res.status(403).json({ error: 'This month is locked for timesheet entries' })
    }

    // Upsert the entry
    const result = await pool.query(
      `INSERT INTO timesheet_entries (user_id, task_id, date, hours, description, entered_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, task_id, date)
       DO UPDATE SET hours = $4, description = $5, entered_by = $6, updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, task_id, TO_CHAR(date, 'YYYY-MM-DD') as date, hours, description, entered_by, created_at, updated_at`,
      [user_id, task_id, date, hoursNum, description || null, entered_by]
    )

    res.json({ entry: result.rows[0] })
  } catch (error) {
    console.error('Create/update timesheet entry error:', error)
    res.status(500).json({ error: 'Failed to save timesheet entry' })
  }
})

// Delete a timesheet entry
app.delete('/api/timesheet/entries/:id', async (req, res) => {
  const { id } = req.params
  const { user_id } = req.query // The user making the request

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  try {
    // Get the entry to check permissions
    const entryResult = await pool.query(
      'SELECT user_id, task_id, date FROM timesheet_entries WHERE id = $1',
      [id]
    )
    if (entryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' })
    }

    const entry = entryResult.rows[0]
    const canEdit = await canEditTimesheetFor(parseInt(user_id as string), entry.user_id, entry.task_id)
    if (!canEdit) {
      return res.status(403).json({ error: 'Not authorized to delete this entry' })
    }

    // Check if month is locked
    const taskResult = await pool.query('SELECT project_id FROM tasks WHERE id = $1', [entry.task_id])
    const projectId = taskResult.rows[0]?.project_id
    const entryDate = new Date(entry.date)

    const lockResult = await pool.query(
      `SELECT id FROM timesheet_locks
       WHERE (project_id = $1 OR project_id IS NULL)
         AND year = $2 AND month = $3`,
      [projectId, entryDate.getFullYear(), entryDate.getMonth() + 1]
    )
    if (lockResult.rows.length > 0) {
      return res.status(403).json({ error: 'This month is locked' })
    }

    await pool.query('DELETE FROM timesheet_entries WHERE id = $1', [id])
    res.json({ message: 'Entry deleted successfully' })
  } catch (error) {
    console.error('Delete timesheet entry error:', error)
    res.status(500).json({ error: 'Failed to delete entry' })
  }
})

// Lock a month for a project (PM or Admin only)
app.post('/api/timesheet/locks', async (req, res) => {
  const { project_id, year, month, locked_by } = req.body

  if (!year || !month || !locked_by) {
    return res.status(400).json({ error: 'year, month, and locked_by are required' })
  }

  try {
    // Check if user is authorized (admin or PM of the project)
    const userResult = await pool.query('SELECT user_type FROM users WHERE id = $1', [locked_by])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const userType = userResult.rows[0].user_type
    if (userType === 'actor') {
      return res.status(403).json({ error: 'Not authorized to lock timesheet' })
    }

    // If project_id is specified, check PM ownership
    if (project_id && userType === 'project_manager') {
      const projectResult = await pool.query(
        'SELECT project_manager_id FROM projects WHERE id = $1',
        [project_id]
      )
      if (projectResult.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' })
      }
      if (projectResult.rows[0].project_manager_id !== locked_by) {
        return res.status(403).json({ error: 'Not authorized to lock this project' })
      }
    }

    // Only admin can create global locks (project_id = null)
    if (!project_id && userType !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can create global locks' })
    }

    const result = await pool.query(
      `INSERT INTO timesheet_locks (project_id, year, month, locked_by, locked_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (project_id, year, month) DO NOTHING
       RETURNING *`,
      [project_id || null, year, month, locked_by]
    )

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'This month is already locked' })
    }

    res.status(201).json({ lock: result.rows[0] })
  } catch (error) {
    console.error('Create timesheet lock error:', error)
    res.status(500).json({ error: 'Failed to create lock' })
  }
})

// Unlock a month (PM or Admin only)
app.delete('/api/timesheet/locks/:id', async (req, res) => {
  const { id } = req.params
  const { user_id } = req.query

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  try {
    // Get the lock
    const lockResult = await pool.query('SELECT * FROM timesheet_locks WHERE id = $1', [id])
    if (lockResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lock not found' })
    }

    const lock = lockResult.rows[0]

    // Check permissions
    const userResult = await pool.query('SELECT user_type FROM users WHERE id = $1', [user_id])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const userType = userResult.rows[0].user_type
    if (userType === 'actor') {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Global locks can only be removed by admin
    if (!lock.project_id && userType !== 'administrator') {
      return res.status(403).json({ error: 'Only administrators can remove global locks' })
    }

    // PM can only unlock their own projects
    if (lock.project_id && userType === 'project_manager') {
      const projectResult = await pool.query(
        'SELECT project_manager_id FROM projects WHERE id = $1',
        [lock.project_id]
      )
      if (projectResult.rows[0]?.project_manager_id !== parseInt(user_id as string)) {
        return res.status(403).json({ error: 'Not authorized to unlock this project' })
      }
    }

    await pool.query('DELETE FROM timesheet_locks WHERE id = $1', [id])
    res.json({ message: 'Lock removed successfully' })
  } catch (error) {
    console.error('Delete timesheet lock error:', error)
    res.status(500).json({ error: 'Failed to remove lock' })
  }
})

// Update remaining hours on a task
app.put('/api/tasks/:taskId/remaining', async (req, res) => {
  const { taskId } = req.params
  const { remaining_hours, user_id } = req.body

  if (remaining_hours === undefined || !user_id) {
    return res.status(400).json({ error: 'remaining_hours and user_id are required' })
  }

  try {
    // Check if task exists and user has permission
    const taskResult = await pool.query(
      `SELECT t.responsible_id, p.project_manager_id
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1`,
      [taskId]
    )

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const task = taskResult.rows[0]
    const userResult = await pool.query('SELECT user_type FROM users WHERE id = $1', [user_id])
    const userType = userResult.rows[0]?.user_type

    // Permission: admin, PM of project, or assignee
    const canUpdate = userType === 'administrator' ||
                      task.project_manager_id === user_id ||
                      task.responsible_id === user_id

    if (!canUpdate) {
      return res.status(403).json({ error: 'Not authorized to update remaining hours' })
    }

    // Calculate the current total timesheet hours for this task
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(hours), 0) as total_hours
       FROM timesheet_entries
       WHERE task_id = $1`,
      [taskId]
    )
    const currentTotal = parseFloat(totalResult.rows[0].total_hours)

    const result = await pool.query(
      `UPDATE tasks SET remaining_hours = $1, last_remaining_update_total = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING id, remaining_hours, last_remaining_update_total`,
      [remaining_hours, currentTotal, taskId]
    )

    res.json({ task: result.rows[0] })
  } catch (error) {
    console.error('Update remaining hours error:', error)
    res.status(500).json({ error: 'Failed to update remaining hours' })
  }
})

// ============================================
// USER SETTINGS API
// ============================================

// Get all settings for a user
app.get('/api/users/:userId/settings', async (req, res) => {
  const { userId } = req.params

  try {
    const result = await pool.query(
      `SELECT setting_key, setting_value FROM user_settings WHERE user_id = $1`,
      [userId]
    )

    // Convert to key-value object
    const settings: Record<string, string> = {}
    for (const row of result.rows) {
      settings[row.setting_key] = row.setting_value
    }

    res.json({ settings })
  } catch (error) {
    console.error('Get user settings error:', error)
    res.status(500).json({ error: 'Failed to fetch user settings' })
  }
})

// Update a single setting for a user
app.put('/api/users/:userId/settings/:key', async (req, res) => {
  const { userId, key } = req.params
  const { value } = req.body

  if (value === undefined) {
    return res.status(400).json({ error: 'value is required' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, setting_key)
       DO UPDATE SET setting_value = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING setting_key, setting_value`,
      [userId, key, value]
    )

    res.json({ setting: result.rows[0] })
  } catch (error) {
    console.error('Update user setting error:', error)
    res.status(500).json({ error: 'Failed to update user setting' })
  }
})

// Delete a setting for a user
app.delete('/api/users/:userId/settings/:key', async (req, res) => {
  const { userId, key } = req.params

  try {
    await pool.query(
      `DELETE FROM user_settings WHERE user_id = $1 AND setting_key = $2`,
      [userId, key]
    )
    res.json({ message: 'Setting deleted successfully' })
  } catch (error) {
    console.error('Delete user setting error:', error)
    res.status(500).json({ error: 'Failed to delete user setting' })
  }
})

// Get users that can be viewed by a PM (users assigned to their projects)
app.get('/api/timesheet/viewable-users', async (req, res) => {
  const { user_id } = req.query

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' })
  }

  try {
    const userResult = await pool.query('SELECT user_type FROM users WHERE id = $1', [user_id])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const userType = userResult.rows[0].user_type

    let usersResult
    if (userType === 'administrator') {
      // Admin can view all users
      usersResult = await pool.query(
        `SELECT id, username, first_name, last_name, email, daily_work_hours
         FROM users WHERE is_active = TRUE
         ORDER BY first_name, last_name`
      )
    } else if (userType === 'project_manager') {
      // PM can view users assigned to tasks in their projects
      usersResult = await pool.query(
        `SELECT DISTINCT u.id, u.username, u.first_name, u.last_name, u.email, u.daily_work_hours
         FROM users u
         JOIN tasks t ON t.responsible_id = u.id
         JOIN projects p ON t.project_id = p.id
         WHERE p.project_manager_id = $1 AND u.is_active = TRUE
         ORDER BY u.first_name, u.last_name`,
        [user_id]
      )
    } else {
      // Actor can only view themselves
      usersResult = await pool.query(
        `SELECT id, username, first_name, last_name, email, daily_work_hours
         FROM users WHERE id = $1`,
        [user_id]
      )
    }

    res.json({ users: usersResult.rows })
  } catch (error) {
    console.error('Get viewable users error:', error)
    res.status(500).json({ error: 'Failed to fetch viewable users' })
  }
})

// Start server
async function start() {
  try {
    // Test database connection
    await pool.query('SELECT 1')
    console.log('✅ Database connection established')

    // Initialize database
    await initDatabase()

    // Start HTTP server
    app.listen(Number(PORT), HOST, () => {
      console.log(`🚀 Backend server running on http://${HOST}:${PORT}`)
      console.log(`📊 Health check: http://${HOST}:${PORT}/health`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

start()

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...')
  await pool.end()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n👋 Shutting down gracefully...')
  await pool.end()
  process.exit(0)
})
