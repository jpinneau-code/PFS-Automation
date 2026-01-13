#!/usr/bin/env node

/*
|--------------------------------------------------------------------------
| HTTP Server
|--------------------------------------------------------------------------
|
| This file is used to start the HTTP server. You are free to customize
| the process of booting the HTTP server.
|
*/

import { Ignitor } from '@adonisjs/core'

const APP_ROOT = new URL('../../', import.meta.url)

new Ignitor(APP_ROOT).httpServer().start()
