import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'setup_statuses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.boolean('is_setup_complete').defaultTo(false).notNullable()
      table.timestamp('setup_completed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    // Insert initial row to track setup status
    this.defer(async (db) => {
      await db.table(this.tableName).insert({
        is_setup_complete: false,
        setup_completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
