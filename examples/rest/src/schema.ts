//#region factory
import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { honoServerPlugin } from '@ultimabase/hono-server-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

import { readingTime } from './operations.ts'

/**
 * REST serves `/api` through the HTTP foundation and the Hono listener.
 * Access decides what clients may do: an exposed route grants nothing.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	httpPlugin({ appId: 'blog' }),
	restPlugin({
		openapi: true, // GET /api/openapi.json
		pagination: { defaultTake: 20, maxTake: 100 },
	}),
	honoServerPlugin(), // listens on PORT, 1337 by default
	postgresPlugin(),
	readingTime, // POST /api/operations/readingTime
)
//#endregion factory

//#region author
/** Authors are managed on the server: clients only read them. */
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({
	access: { read: true },
	// These methods get no route: POST /api/classes/Author answers 405.
	rest: { createOne: false, updateOne: false, deleteOne: false },
})
//#endregion author

//#region tag
/** Tags have no route of their own; posts link and include them. */
export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({ access: { read: true }, rest: false })
//#endregion tag

//#region post
/** Every client may read and write posts: this example has no sign-in. */
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		slug: field.string({ required: true }),
		views: field.int({ default: 0 }),
		author: field.pointer({ target: () => Author }),
		tags: field.relation({ target: () => Tag }),
		// A moderation note no client may read, filter, sort or write.
		reviewNote: field.string({ access: { read: false, write: false } }),
	}),
}).with({
	indexes: [{ fields: ['slug'], unique: true }],
	access: { read: true, create: true, update: true, delete: true },
	// The built-in routes, plus count and the atomic bulk create.
	rest: { count: true, createMany: true },
})
//#endregion post

//#region feedback
/** Clients may send feedback but never read it back. */
export const Feedback = App.Schema.define({
	className: 'Feedback',
	fields: (field) => ({ message: field.string({ required: true }) }),
}).with({ access: { create: true } })
//#endregion feedback
