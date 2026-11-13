// The application: posts whose commit hook mails the followers. Sentry sees
// each query and hook in its request's trace, and each failed mail.
import { httpPlugin } from '@ultimabase/http'
import { sentryPlugin } from '@ultimabase/sentry'
import { defineApp, defineFunction, defineModel, memory } from 'ultimabase'
import { mailer } from './services.ts'

export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({ title: f.string() }),
}).with({
	hooks: {
		// After the commit: a failure keeps the post, and the server logs it.
		afterCreateCommit: ({ record }) => {
			mailer.send(`New post: ${record.title}`)
		},
	},
})

//#region logged
// Mails the day's digest: a failure is logged with its error, which makes it
// a Sentry issue.
export const sendDigest = defineFunction({
	name: 'sendDigest',
	run: ({ logger }) => {
		try {
			mailer.send('Your digest.')
		} catch (error) {
			logger.error({ err: error }, 'The digest was not sent.')
		}
	},
})
//#endregion

//#region plugins
export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Reads the application's work into the client Sentry.init made.
	plugins: [httpPlugin(), sentryPlugin()],
	models: [Post],
	functions: [sendDigest],
})
//#endregion
