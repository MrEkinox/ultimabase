//#region init
// Imported first, before the application: it imports none of its modules.
import * as Sentry from '@sentry/node'

Sentry.init({
	dsn: process.env['SENTRY_DSN'],
	// One request in ten makes a trace; every error makes an issue.
	tracesSampleRate: 0.1,
})
//#endregion
