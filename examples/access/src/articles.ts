import { App } from './schema.ts'

//#region article
/** Readers see published articles only; `internalNote` never leaves the server. */
export const Article = App.Schema.define({
	className: 'Article',
	fields: (field) => ({
		internalNote: field.string({ access: { read: false, write: false } }),
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
}).with({
	// No create, update, upsert or delete rule: they stay denied.
	access: { read: ({ where }) => where.eq('published', true) },
})
//#endregion article

//#region subscriber
/** The number of subscribers is public; the subscribers are not. */
export const Subscriber = App.Schema.define({
	className: 'Subscriber',
	fields: (field) => ({ email: field.string({ required: true }) }),
}).with({ access: { read: { count: true } } })
//#endregion subscriber

//#region story
/** Updates reach unlocked stories and never retitle a published one. */
export const Story = App.Schema.define({
	className: 'Story',
	fields: (field) => ({
		locked: field.boolean({ default: false }),
		published: field.boolean({ default: false }),
		title: field.string({ required: true }),
	}),
}).with({
	access: {
		read: true,
		update: {
			// Before loading: a private filter on the rows an update may reach.
			where: ({ where }) => where.eq('locked', false),
			// On each locked original and its prepared candidate.
			item: ({ item, originalItem }) =>
				!originalItem.published || item.title === originalItem.title,
		},
	},
})
//#endregion story
