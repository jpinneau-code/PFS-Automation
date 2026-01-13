import { HttpContext } from '@adonisjs/core/http'
import { NextFn } from '@adonisjs/core/types/http'
import SetupStatus from '#models/SetupStatus'

/**
 * Middleware to redirect to setup page if application is not configured
 * Allows access to setup routes and health check
 */
export default class SetupMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    // Allow health check and setup routes
    const path = request.url()
    const allowedPaths = ['/health', '/api/setup/status', '/api/setup/complete']

    if (allowedPaths.some(allowedPath => path.includes(allowedPath))) {
      return next()
    }

    try {
      // Check if setup is complete
      const setupStatus = await SetupStatus.first()

      if (!setupStatus || !setupStatus.isSetupComplete) {
        return response.status(503).json({
          error: 'Application setup required',
          setupRequired: true,
          message: 'Please complete the initial setup at /setup'
        })
      }

      return next()
    } catch (error) {
      console.error('Setup middleware error:', error)
      return response.status(500).json({
        error: 'Failed to verify setup status'
      })
    }
  }
}
