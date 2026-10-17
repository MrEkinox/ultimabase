//#region imports
import { App } from './app.ts'
import { readingService } from './reading-service.ts'
//#endregion imports

//#region author
/** Authors are managed on the server: clients only read them. */
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({ name: field.string({ required: true }) }),
}).with({
	access: { read: true },
	// No createAuthor, updateAuthor or deleteAuthor mutation.
	graphql: { createOne: false, updateOne: false, deleteOne: false },
})
//#endregion author

//#region comment
/** Comments are written through their post: no root mutation. */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({ body: field.string({ required: true }) }),
}).with({
	access: { read: true, create: true },
	graphql: { createOne: false, updateOne: false, deleteOne: false },
})
//#endregion comment

//#region post
/** Every client may read and write posts: this example has no sign-in. */
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		body: field.string({ default: '' }),
		views: field.int({ default: 0 }),
		status: field.enum({ values: ['draft', 'published'], default: 'draft' }),
		author: field.pointer({ target: () => Author }),
		comments: field.relation({ target: () => Comment }),
		// A moderation note no client may read, filter, sort or write.
		reviewNote: field.string({ access: { read: false, write: false } }),
		// Output only: one call resolves every post of a read.
		readingMinutes: field.virtual({
			output: (output) => output.int(),
			select: { body: true },
			resolveMany: ({ items }) =>
				readingService.estimate(
					items.map(({ body }) => (typeof body === 'string' ? body : '')),
				),
		}),
	}),
}).with({
	access: { read: true, create: true, update: true, delete: true },
	// The default fields, plus countPost and totalCount on connections.
	graphql: { count: true },
})
//#endregion post

//#region feedback
/**
 * Clients may send feedback but never read it back. `updateFeedback` and
 * `deleteFeedback` exist by default, yet Access denies them.
 */
export const Feedback = App.Schema.define({
	className: 'Feedback',
	fields: (field) => ({ message: field.string({ required: true }) }),
}).with({ access: { create: true } })
//#endregion feedback

//#region audit
/**
 * Server-side records: no root field or mutation reads or writes them. The
 * link to a post lives here, so no exposed type reaches AuditEntry and GraphQL
 * leaves it out entirely.
 */
export const AuditEntry = App.Schema.define({
	className: 'AuditEntry',
	fields: (field) => ({
		action: field.string({ required: true }),
		post: field.pointer({ target: () => Post }),
	}),
}).with({ graphql: false })
//#endregion audit
