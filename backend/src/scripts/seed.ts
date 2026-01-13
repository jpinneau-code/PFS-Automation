import pg from 'pg'
import bcrypt from 'bcrypt'
import { config } from 'dotenv'

config()

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'pfs_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'pfs_automation',
})

async function seed() {
  const client = await pool.connect()

  try {
    console.log('🌱 Starting database seeding...\n')

    // Check if data already exists
    const userCount = await client.query('SELECT COUNT(*) FROM users')
    if (parseInt(userCount.rows[0].count) > 1) {
      console.log('⚠️  Database already has data. Skipping seed.')
      console.log('   Run "pnpm run seed:force" to force re-seed.\n')
      return
    }

    await client.query('BEGIN')

    // ============================================
    // 1. Create test users
    // ============================================
    console.log('👥 Creating test users...')

    const hashedPassword = await bcrypt.hash('Test123!', 10)

    // Project Managers
    const pm1 = await client.query(
      `INSERT INTO users (email, username, password, first_name, last_name, user_type, preferred_language, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['pm1@test.com', 'pm_alice', hashedPassword, 'Alice', 'Johnson', 'project_manager', 'en']
    )

    const pm2 = await client.query(
      `INSERT INTO users (email, username, password, first_name, last_name, user_type, preferred_language, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['pm2@test.com', 'pm_bob', hashedPassword, 'Bob', 'Smith', 'project_manager', 'fr']
    )

    // Actors
    const actor1 = await client.query(
      `INSERT INTO users (email, username, password, first_name, last_name, user_type, preferred_language, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['dev1@test.com', 'dev_charlie', hashedPassword, 'Charlie', 'Brown', 'actor', 'en']
    )

    const actor2 = await client.query(
      `INSERT INTO users (email, username, password, first_name, last_name, user_type, preferred_language, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['dev2@test.com', 'dev_diana', hashedPassword, 'Diana', 'Prince', 'actor', 'en']
    )

    const actor3 = await client.query(
      `INSERT INTO users (email, username, password, first_name, last_name, user_type, preferred_language, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['qa@test.com', 'qa_eve', hashedPassword, 'Eve', 'Taylor', 'actor', 'fr']
    )

    console.log(`  ✓ Created 5 test users (password: Test123!)`)

    // ============================================
    // 2. Create clients
    // ============================================
    console.log('🏢 Creating test clients...')

    const client1 = await client.query(
      `INSERT INTO clients (client_name, contact_first_name, contact_last_name, contact_email, contact_phone, city, country, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['Acme Corporation', 'John', 'Doe', 'john.doe@acme.com', '+1-555-0100', 'New York', 'USA']
    )

    const client2 = await client.query(
      `INSERT INTO clients (client_name, contact_first_name, contact_last_name, contact_email, contact_phone, city, country, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['TechStart Inc', 'Sarah', 'Connor', 'sarah@techstart.io', '+33-1-45-67-89-00', 'Paris', 'France']
    )

    const client3 = await client.query(
      `INSERT INTO clients (client_name, contact_first_name, contact_last_name, contact_email, contact_phone, city, country, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      ['Global Solutions Ltd', 'Michael', 'Scott', 'michael@global-solutions.com', '+44-20-1234-5678', 'London', 'UK']
    )

    console.log(`  ✓ Created 3 test clients`)

    // ============================================
    // 3. Create projects
    // ============================================
    console.log('📊 Creating test projects...')

    const project1 = await client.query(
      `INSERT INTO projects (project_name, client_id, project_manager_id, country, status, start_date, end_date, description, budget, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        'E-Commerce Platform Redesign',
        client1.rows[0].id,
        pm1.rows[0].id,
        'USA',
        'in_progress',
        '2026-01-01',
        '2026-06-30',
        'Complete redesign of the e-commerce platform with modern UI/UX',
        250000.00
      ]
    )

    const project2 = await client.query(
      `INSERT INTO projects (project_name, client_id, project_manager_id, country, status, start_date, end_date, description, budget, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        'Mobile App Development',
        client2.rows[0].id,
        pm2.rows[0].id,
        'France',
        'created',
        '2026-02-01',
        '2026-08-31',
        'Native mobile app for iOS and Android',
        180000.00
      ]
    )

    const project3 = await client.query(
      `INSERT INTO projects (project_name, client_id, project_manager_id, country, status, start_date, end_date, description, budget, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        'Data Migration Project',
        client3.rows[0].id,
        pm1.rows[0].id,
        'UK',
        'frozen',
        '2025-10-01',
        '2026-03-31',
        'Migrate legacy data to new cloud infrastructure',
        120000.00
      ]
    )

    console.log(`  ✓ Created 3 test projects`)

    // ============================================
    // 4. Assign users to projects
    // ============================================
    console.log('👤 Assigning users to projects...')

    // Project 1
    await client.query(
      `INSERT INTO project_users (project_id, user_id, role, assigned_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [project1.rows[0].id, actor1.rows[0].id, 'Frontend Developer']
    )
    await client.query(
      `INSERT INTO project_users (project_id, user_id, role, assigned_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [project1.rows[0].id, actor2.rows[0].id, 'Backend Developer']
    )

    // Project 2
    await client.query(
      `INSERT INTO project_users (project_id, user_id, role, assigned_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [project2.rows[0].id, actor1.rows[0].id, 'Mobile Developer']
    )
    await client.query(
      `INSERT INTO project_users (project_id, user_id, role, assigned_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [project2.rows[0].id, actor3.rows[0].id, 'QA Engineer']
    )

    console.log(`  ✓ Assigned users to projects`)

    // ============================================
    // 5. Create stages for Project 1
    // ============================================
    console.log('📅 Creating project stages...')

    const stage1 = await client.query(
      `INSERT INTO stages (project_id, stage_name, stage_order, start_date, end_date, description, is_completed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [project1.rows[0].id, 'Discovery & Planning', 1, '2026-01-01', '2026-01-31', 'Initial discovery and project planning phase', true]
    )

    const stage2 = await client.query(
      `INSERT INTO stages (project_id, stage_name, stage_order, start_date, end_date, description, is_completed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [project1.rows[0].id, 'Design Phase', 2, '2026-02-01', '2026-02-28', 'UI/UX design and prototyping', false]
    )

    const stage3 = await client.query(
      `INSERT INTO stages (project_id, stage_name, stage_order, start_date, end_date, description, is_completed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [project1.rows[0].id, 'Development', 3, '2026-03-01', '2026-05-31', 'Main development phase', false]
    )

    const stage4 = await client.query(
      `INSERT INTO stages (project_id, stage_name, stage_order, start_date, end_date, description, is_completed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [project1.rows[0].id, 'Testing & QA', 4, '2026-06-01', '2026-06-20', 'Quality assurance and testing', false]
    )

    const stage5 = await client.query(
      `INSERT INTO stages (project_id, stage_name, stage_order, start_date, end_date, description, is_completed, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [project1.rows[0].id, 'Deployment', 5, '2026-06-21', '2026-06-30', 'Production deployment', false]
    )

    console.log(`  ✓ Created 5 stages for Project 1`)

    // ============================================
    // 6. Create tasks
    // ============================================
    console.log('✅ Creating test tasks...')

    // Tasks for Stage 1 (completed)
    await client.query(
      `INSERT INTO tasks (stage_id, project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, completed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [stage1.rows[0].id, project1.rows[0].id, 'Requirements Gathering', 'Collect and document all requirements', 5, actor1.rows[0].id, 'high', 'done', '2026-01-01', '2026-01-15']
    )

    await client.query(
      `INSERT INTO tasks (stage_id, project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, completed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [stage1.rows[0].id, project1.rows[0].id, 'Create Project Plan', 'Develop detailed project plan and timeline', 3, pm1.rows[0].id, 'urgent', 'done', '2026-01-16', '2026-01-31']
    )

    // Tasks for Stage 2 (in progress)
    await client.query(
      `INSERT INTO tasks (stage_id, project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [stage2.rows[0].id, project1.rows[0].id, 'Design Homepage', 'Create homepage mockups and prototypes', 8, actor1.rows[0].id, 'high', 'in_progress', '2026-02-01', '2026-02-15']
    )

    await client.query(
      `INSERT INTO tasks (stage_id, project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [stage2.rows[0].id, project1.rows[0].id, 'Design Product Pages', 'Create product page templates', 10, actor1.rows[0].id, 'high', 'todo', '2026-02-10', '2026-02-25']
    )

    await client.query(
      `INSERT INTO tasks (stage_id, project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [stage2.rows[0].id, project1.rows[0].id, 'User Flow Diagrams', 'Create user journey diagrams', 4, null, 'medium', 'todo', '2026-02-05', '2026-02-20']
    )

    // Tasks for Stage 3 (pending)
    await client.query(
      `INSERT INTO tasks (stage_id, project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [stage3.rows[0].id, project1.rows[0].id, 'Setup Development Environment', 'Configure dev servers and tools', 2, actor2.rows[0].id, 'urgent', 'todo', '2026-03-01', '2026-03-05']
    )

    await client.query(
      `INSERT INTO tasks (stage_id, project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [stage3.rows[0].id, project1.rows[0].id, 'Implement Authentication', 'Build user authentication system', 15, actor2.rows[0].id, 'high', 'todo', '2026-03-05', '2026-03-25']
    )

    // Task without stage (directly linked to project)
    await client.query(
      `INSERT INTO tasks (project_id, task_name, description, sold_days, responsible_id, priority, status, start_date, due_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [project1.rows[0].id, 'Project Documentation', 'Maintain project documentation throughout', 5, pm1.rows[0].id, 'low', 'in_progress', '2026-01-01', '2026-06-30']
    )

    console.log(`  ✓ Created 9 test tasks`)

    await client.query('COMMIT')

    console.log('\n✅ Database seeding completed successfully!')
    console.log('\n📝 Test credentials:')
    console.log('   Administrator: jpinneau (created during setup)')
    console.log('   PM 1: pm_alice / Test123!')
    console.log('   PM 2: pm_bob / Test123!')
    console.log('   Developer 1: dev_charlie / Test123!')
    console.log('   Developer 2: dev_diana / Test123!')
    console.log('   QA: qa_eve / Test123!\n')

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
seed().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
