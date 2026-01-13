/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const HealthController = () => import('#controllers/HealthController')
const SetupController = () => import('#controllers/SetupController')

// Health check
router.get('/health', [HealthController, 'check'])

// Setup routes (not protected by setup middleware)
router.get('/api/setup/status', [SetupController, 'status'])
router.post('/api/setup/complete', [SetupController, 'complete'])

// Protected routes (add your application routes here)
// router.group(() => {
//   // Your routes here
// }).middleware('setup')
