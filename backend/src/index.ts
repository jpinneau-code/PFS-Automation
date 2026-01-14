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
    // 5. Create projects table
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

    // ============================================
    // 6. Create project_users table (N-N)
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

    let projectsQuery
    let queryParams

    if (user.user_type === 'administrator') {
      // Administrator: get ALL projects
      projectsQuery = `
        SELECT
          p.*,
          c.client_name,
          u.username as project_manager_username,
          u.first_name as project_manager_first_name,
          u.last_name as project_manager_last_name,
          COUNT(DISTINCT pu.user_id) as team_size,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN tasks t ON p.id = t.project_id AND t.parent_task_id IS NULL
        WHERE p.status IN ('created', 'in_progress')
        GROUP BY p.id, c.client_name, u.username, u.first_name, u.last_name
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
          COUNT(DISTINCT pu.user_id) as team_size,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN tasks t ON p.id = t.project_id AND t.parent_task_id IS NULL
        WHERE p.project_manager_id = $1 AND p.status IN ('created', 'in_progress')
        GROUP BY p.id, c.client_name, u.username, u.first_name, u.last_name
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
          COUNT(DISTINCT pu.user_id) as team_size,
          COUNT(DISTINCT t.id) as total_tasks,
          COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks
        FROM projects p
        INNER JOIN project_users pu_filter ON p.id = pu_filter.project_id AND pu_filter.user_id = $1
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN users u ON p.project_manager_id = u.id
        LEFT JOIN project_users pu ON p.id = pu.project_id
        LEFT JOIN tasks t ON p.id = t.project_id AND t.parent_task_id IS NULL
        WHERE p.status IN ('created', 'in_progress')
        GROUP BY p.id, c.client_name, u.username, u.first_name, u.last_name
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

// Get project details with stages, tasks and subtasks
app.get('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params

  try {
    // Get project details
    const projectResult = await pool.query(
      `SELECT p.*, c.client_name,
              u.username as pm_username, u.first_name as pm_first_name, u.last_name as pm_last_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN users u ON p.project_manager_id = u.id
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
    tasksResult.rows.forEach(task => {
      tasksMap.set(task.id, { ...task, subtasks: [] })
    })

    // Second pass: build hierarchy
    tasksResult.rows.forEach(task => {
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
    const stages = stagesResult.rows.map(stage => ({
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
    const result = await pool.query(
      `UPDATE stages
       SET stage_name = COALESCE($1, stage_name),
           description = COALESCE($2, description),
           start_date = COALESCE($3, start_date),
           end_date = COALESCE($4, end_date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [stage_name, description, start_date, end_date, stageId]
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
