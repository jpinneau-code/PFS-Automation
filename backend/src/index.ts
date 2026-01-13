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
        task_name VARCHAR(255) NOT NULL,
        description TEXT,
        sold_days DECIMAL(10, 2) DEFAULT 0 NOT NULL,
        responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        priority VARCHAR(50) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'todo',
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

    console.log('  ✓ Tasks table ready')

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
