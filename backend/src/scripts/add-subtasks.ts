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

async function addSubtasks() {
  const client = await pool.connect()

  try {
    console.log('🔄 Adding subtasks support to tasks table...\n')

    // Check if parent_task_id column already exists
    const columnCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='tasks' AND column_name='parent_task_id'
    `)

    if (columnCheck.rows.length > 0) {
      console.log('✅ Subtasks support already added. Database is up to date.\n')
      return
    }

    await client.query('BEGIN')

    console.log('📝 Adding parent_task_id column to tasks table...')

    // Add parent_task_id column
    await client.query(`
      ALTER TABLE tasks
      ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE
    `)

    console.log('  ✓ parent_task_id column added')

    // Create index for performance
    await client.query(`
      CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id)
    `)

    console.log('  ✓ Index created on parent_task_id')

    // Add comment to document the constraint
    await client.query(`
      COMMENT ON COLUMN tasks.parent_task_id IS 'Reference to parent task. If not NULL, this is a subtask. Subtasks inherit stage_id from parent task.'
    `)

    console.log('  ✓ Column documentation added')

    await client.query('COMMIT')

    console.log('\n✅ Subtasks support added successfully!')
    console.log('\n📋 Business Rules:')
    console.log('   - A subtask has parent_task_id NOT NULL')
    console.log('   - A subtask inherits stage_id from its parent task')
    console.log('   - A subtask can have its own stage_id = NULL (will be handled at app level)')
    console.log('   - When a parent task is deleted, all subtasks are deleted (CASCADE)')
    console.log('   - Subtasks can have subtasks (recursive hierarchy supported)\n')

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
addSubtasks().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})