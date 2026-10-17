import { afterAll, onTestFinished } from 'vitest'

import {
	setTestFinishedHook,
	stopTestApplication,
} from './application/test-application.js'

// The application of a test file stops with the file, and its schema goes.
afterAll(stopTestApplication)

// testApplication() inside a test waits for its after-commit work when the
// test finishes; outside a test, Vitest refuses the hook and nothing waits.
setTestFinishedHook((wait) => {
	try {
		onTestFinished(wait)
		return true
	} catch {
		return false
	}
})
