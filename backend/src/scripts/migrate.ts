import pg from 'pg'
import { config } from 'dotenv'

config()

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'pfs_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'pfs_automation',
})

async function migrate() {
  const client = await pool.connect()

  try {
    console.log('🔄 Starting database migration...\n')

    // Check if user_type column already exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='users' AND column_name='user_type'
    `)

    if (columnCheck.rows.length > 0) {
      console.log('✅ Migration already applied. Database is up to date.\n')
      return
    }

    await client.query('BEGIN')

    console.log('📝 Migrating users table...')

    // Add new columns
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS user_type VARCHAR(50) DEFAULT 'actor',
      ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP
    `)

    // Migrate existing data: convert is_admin to user_type
    await client.query(`
      UPDATE users
      SET user_type = CASE
        WHEN is_admin = TRUE THEN 'administrator'
        ELSE 'actor'
      END
    `)

    // Make user_type NOT NULL after migration
    await client.query(`
      ALTER TABLE users
      ALTER COLUMN user_type SET NOT NULL
    `)

    // Add constraints
    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT check_user_type CHECK (user_type IN ('administrator', 'project_manager', 'actor'))
    `)

    await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT check_preferred_language CHECK (preferred_language IN ('en', 'fr', 'es', 'de'))
    `)

    // Drop the old is_admin column
    await client.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS is_admin
    `)

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)
    `)

    console.log('  ✓ Users table migrated')

    await client.query('COMMIT')

    console.log('\n✅ Migration completed successfully!\n')

  } catch (error) {
    await client.query('ROLLBACK')
    console.error('❌ Migration error:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
