import { HttpContext } from '@adonisjs/core/http'
import Database from '@adonisjs/lucid/services/db'

export default class HealthController {
  /**
   * Health check endpoint for monitoring and Docker healthcheck
   */
  async check({ response }: HttpContext) {
    try {
      // Check database connection
      await Database.rawQuery('SELECT 1')

      return response.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'pfs-automation-backend'
      })
    } catch (error) {
      return response.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'pfs-automation-backend',
        error: 'Database connection failed'
      })
    }
  }
}
