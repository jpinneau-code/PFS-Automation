import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

export default defineConfig({
  connection: env.get('DB_CONNECTION', 'postgres'),

  connections: {
    postgres: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST', 'localhost'),
        port: env.get('DB_PORT', 5432),
        user: env.get('DB_USER', 'pfs_user'),
        password: env.get('DB_PASSWORD', ''),
        database: env.get('DB_DATABASE', 'pfs_automation'),
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      healthCheck: false,
      debug: false,
    },
  },
})
