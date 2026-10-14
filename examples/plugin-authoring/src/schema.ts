//#region factory
import { apiServer } from '@ultimabase/api-server'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { archivePlugin } from './archive-plugin.ts'
import { auditPlugin } from './audit-plugin.ts'
import { flagPlugin } from './flag-plugin.ts'

/**
 * The schema plugins type `.archivable()`, `.flaggable()` and their rules
 * from their own source: no generation step. REST and GraphQL accept every
 * client's writes to keep the example short; install Access before exposing
 * an application.
 */
export const App = UltimaBase.use(
	archivePlugin(),
	auditPlugin(),
	flagPlugin(),
	...apiServer({
		rest: { publicWrites: true },
		graphql: { publicWrites: true },
	}),
	postgresPlugin(), // reads DATABASE_URL when the application starts
)
//#endregion factory

//#region post
export const Post = App.Schema.define({
	className: 'Post',
	fields: (f) => ({ title: f.string({ required: true }) }),
})
	.archivable()
	.with({
		audit: true,
		rest: { archiveOne: true },
		graphql: { archiveOne: true },
	})
//#endregion post

//#region comment
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (f) => ({ body: f.string({ required: true }) }),
})
	.flaggable()
	.with({ flagReason: 'Reported by a reader' })
//#endregion comment
