//#region init
// Imported first by `src/server.ts`, before the application's modules.
import * as Sentry from '@sentry/node'

Sentry.init({
	dsn: process.env['SENTRY_DSN'],
	// One request in ten makes a trace; every error makes an issue.
	tracesSampleRate: 0.1,
})
//#endregion
