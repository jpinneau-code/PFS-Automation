import { HttpContext } from '@adonisjs/core/http'
import User from '#models/User'
import SetupStatus from '#models/SetupStatus'
import { DateTime } from 'luxon'

export default class SetupController {
  /**
   * Check if setup is complete
   */
  async status({ response }: HttpContext) {
    try {
      const setupStatus = await SetupStatus.first()

      if (!setupStatus) {
        return response.status(500).json({
          error: 'Setup status not initialized'
        })
      }

      return response.json({
        isSetupComplete: setupStatus.isSetupComplete,
        setupCompletedAt: setupStatus.setupCompletedAt
      })
    } catch (error) {
      return response.status(500).json({
        error: 'Failed to check setup status'
      })
    }
  }

  /**
   * Complete initial setup by creating admin user
   */
  async complete({ request, response }: HttpContext) {
    try {
      // Check if setup is already complete
      const setupStatus = await SetupStatus.first()

      if (!setupStatus) {
        return response.status(500).json({
          error: 'Setup status not initialized'
        })
      }

      if (setupStatus.isSetupComplete) {
        return response.status(400).json({
          error: 'Setup already completed'
        })
      }

      // Validate request data
      const data = request.only(['email', 'username', 'password', 'firstName', 'lastName'])

      if (!data.email || !data.username || !data.password) {
        return response.status(400).json({
          error: 'Email, username, and password are required'
        })
      }

      // Validate password strength
      if (data.password.length < 8) {
        return response.status(400).json({
          error: 'Password must be at least 8 characters long'
        })
      }

      // Create admin user
      const adminUser = await User.create({
        email: data.email,
        username: data.username,
        password: data.password,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        isAdmin: true,
        isActive: true
      })

      // Mark setup as complete
      setupStatus.isSetupComplete = true
      setupStatus.setupCompletedAt = DateTime.now()
      await setupStatus.save()

      return response.status(201).json({
        message: 'Setup completed successfully',
        user: {
          id: adminUser.id,
          email: adminUser.email,
          username: adminUser.username,
          isAdmin: adminUser.isAdmin
        }
      })
    } catch (error) {
      console.error('Setup error:', error)

      // Handle unique constraint violations
      if (error.code === '23505') {
        return response.status(400).json({
          error: 'Email or username already exists'
        })
      }

      return response.status(500).json({
        error: 'Failed to complete setup'
      })
    }
  }
}
