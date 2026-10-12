import { afterAll } from 'vitest'

import { stopTestApplication } from './application/test-application.js'

// The application of a test file stops with the file, and its schema goes.
afterAll(stopTestApplication)
