import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Application Secret
  |--------------------------------------------------------------------------
  */
  appKey: process.env.APP_KEY || '',

  /*
  |--------------------------------------------------------------------------
  | HTTP Configuration
  |--------------------------------------------------------------------------
  */
  http: {
    allowMethodSpoofing: false,
    subdomainOffset: 2,
    generateRequestId: true,
    trustProxy: false,
    cookie: {},
  },
})
