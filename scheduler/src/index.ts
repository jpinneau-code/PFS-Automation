import cron from 'node-cron'
import dotenv from 'dotenv'

dotenv.config()

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED === 'true'

console.log('PFS Automation Scheduler starting...')
console.log(`Scheduler enabled: ${SCHEDULER_ENABLED}`)

if (SCHEDULER_ENABLED) {
  // Example: Run a task every day at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('Running daily maintenance task')
    // Add your scheduled tasks here
  })

  // Example: Run a task every hour
  cron.schedule('0 * * * *', () => {
    console.log('Running hourly check task')
    // Add your scheduled tasks here
  })

  console.log('Scheduler tasks registered successfully')
} else {
  console.log('Scheduler is disabled')
}

// Keep the process running
process.on('SIGINT', () => {
  console.log('Scheduler shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Scheduler shutting down...')
  process.exit(0)
})
