import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * SetupStatus model to track if the application has been configured
 * This prevents the setup wizard from being accessible after initial setup
 */
export default class SetupStatus extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare isSetupComplete: boolean

  @column.dateTime()
  declare setupCompletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
