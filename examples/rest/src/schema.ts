import { App } from './app.ts'

//#region author
/** Authors are managed on the server: clients only read them. */
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({
	access: { read: true },
	// No write gets a route: POST /api/classes/Author answers 405.
	expose: { write: false },
})
//#endregion author

//#region tag
/** Tags have no route of their own; posts link and include them. */
export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({ access: { read: true }, expose: false })
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
	indexes: [{ fields: ['slug'], unique: true }],
}).with({
	access: { read: true, create: true, update: true, delete: true },
	// The built-in routes, plus count and the atomic bulk create.
	expose: { count: true, createMany: true },
})
//#endregion post

//#region feedback
/** Clients may send feedback but never read it back. */
export const Feedback = App.Schema.define({
	className: 'Feedback',
	fields: (field) => ({ message: field.string({ required: true }) }),
}).with({ access: { create: true } })
//#endregion feedback
