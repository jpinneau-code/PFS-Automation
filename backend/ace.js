#!/usr/bin/env node

/*
|--------------------------------------------------------------------------
| Ace CLI
|--------------------------------------------------------------------------
|
| The Ace CLI is a command-line tool for interacting with your AdonisJS
| application.
|
*/

import { Ignitor } from '@adonisjs/core'

const APP_ROOT = new URL('../', import.meta.url)

new Ignitor(APP_ROOT).ace().handle(process.argv.splice(2))
