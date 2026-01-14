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

async function seedSubtasks() {
  const client = await pool.connect()

  try {
    console.log('🌱 Adding subtasks examples to existing tasks...\n')

    // Find a task to add subtasks to
    const taskResult = await client.query(`
      SELECT id, task_name, stage_id, project_id, responsible_id
      FROM tasks
      WHERE parent_task_id IS NULL
      ORDER BY id
      LIMIT 1
    `)

    if (taskResult.rows.length === 0) {
      console.log('⚠️  No main tasks found. Run "pnpm run seed" first.\n')
      return
    }

    const mainTask = taskResult.rows[0]
    console.log(`📋 Adding subtasks to: "${mainTask.task_name}" (ID: ${mainTask.id})\n`)

    await client.query('BEGIN')

    // Subtask 1
    const subtask1 = await client.query(
      `INSERT INTO tasks (
        parent_task_id, stage_id, project_id, task_name, description,
        sold_days, responsible_id, priority, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id`,
      [
        mainTask.id,
        null, // subtasks don't have stage_id (inherited from parent)
        mainTask.project_id,
        'Backend API Development',
        'Develop REST API endpoints for the module',
        5.0,
        mainTask.responsible_id,
        'high',
        'in_progress'
      ]
    )

    console.log(`  ✓ Created subtask: "Backend API Development"`)

    // Subtask 1.1 (sub-subtask)
    await client.query(
      `INSERT INTO tasks (
        parent_task_id, stage_id, project_id, task_name, description,
        sold_days, responsible_id, priority, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        subtask1.rows[0].id,
        null,
        mainTask.project_id,
        'Create User Endpoints',
        'POST, GET, PUT, DELETE for users',
        2.0,
        mainTask.responsible_id,
        'high',
        'done'
      ]
    )

    console.log(`    ✓ Created sub-subtask: "Create User Endpoints"`)

    // Subtask 1.2 (sub-subtask)
    await client.query(
      `INSERT INTO tasks (
        parent_task_id, stage_id, project_id, task_name, description,
        sold_days, responsible_id, priority, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        subtask1.rows[0].id,
        null,
        mainTask.project_id,
        'Create Project Endpoints',
        'CRUD operations for projects',
        3.0,
        mainTask.responsible_id,
        'high',
        'in_progress'
      ]
    )

    console.log(`    ✓ Created sub-subtask: "Create Project Endpoints"`)

    // Subtask 2
    await client.query(
      `INSERT INTO tasks (
        parent_task_id, stage_id, project_id, task_name, description,
        sold_days, responsible_id, priority, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        mainTask.id,
        null,
        mainTask.project_id,
        'Frontend Integration',
        'Connect frontend to backend APIs',
        4.0,
        mainTask.responsible_id,
        'medium',
        'todo'
      ]
    )

    console.log(`  ✓ Created subtask: "Frontend Integration"`)

    // Subtask 3
    await client.query(
      `INSERT INTO tasks (
        parent_task_id, stage_id, project_id, task_name, description,
        sold_days, responsible_id, priority, status,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        mainTask.id,
        null,
        mainTask.project_id,
        'Write Unit Tests',
        'Unit tests for all endpoints',
        3.0,
        null,
        'medium',
        'todo'
      ]
    )

    console.log(`  ✓ Created subtask: "Write Unit Tests"`)

    await client.query('COMMIT')

    console.log('\n✅ Subtasks examples added successfully!')

    // Display the hierarchy
    console.log('\n📊 Task Hierarchy:')
    const hierarchy = await client.query(`
      WITH RECURSIVE task_tree AS (
        SELECT id, task_name, parent_task_id, 0 as level
        FROM tasks
        WHERE id = $1
        UNION ALL
        SELECT t.id, t.task_name, t.parent_task_id, tt.level + 1
        FROM tasks t
        INNER JOIN task_tree tt ON t.parent_task_id = tt.id
      )
      SELECT id, task_name, level FROM task_tree ORDER BY level, id
    `, [mainTask.id])

    hierarchy.rows.forEach(row => {
      const indent = '  '.repeat(row.level)
      const prefix = row.level === 0 ? '📋' : row.level === 1 ? '  ├─' : '    └─'
      console.log(`${prefix}${indent} ${row.task_name} (ID: ${row.id})`)
    })

    // Calculate total sold_days
    const totalDays = await client.query(`
      WITH RECURSIVE task_subtasks AS (
        SELECT * FROM tasks WHERE id = $1
        UNION ALL
        SELECT t.* FROM tasks t
        INNER JOIN task_subtasks ts ON t.parent_task_id = ts.id
      )
      SELECT SUM(sold_days) as total_sold_days FROM task_subtasks
    `, [mainTask.id])

    console.log(`\n💰 Total sold_days (including all subtasks): ${totalDays.rows[0].total_sold_days} days\n`)

  } catch (error) {
    await client.query('ROLLBACK')
    console.error('❌ Seed error:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

// Run seed
seedSubtasks().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
