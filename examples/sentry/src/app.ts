// The application: posts whose commit hook mails the followers. Sentry sees
// each query and hook in its request's trace, and each failed mail.
import { httpPlugin } from '@ultimabase/http'
import { sentryPlugin } from '@ultimabase/sentry'
import { defineApp, defineModel, memory } from 'ultimabase'
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

//#region plugins
export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Reads the application's work into the client Sentry.init made.
	plugins: [httpPlugin(), sentryPlugin()],
	models: [Post],
})
//#endregion
