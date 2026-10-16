//#region imports
import {
	PublicError,
	isAuthenticated,
	type PolicyPredicate,
} from '@ultimabase/core'

import { App } from './app.ts'
//#endregion imports

//#region author
/** A writer; requests run on behalf of an Author (the request principal). */
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		email: field.string({ required: true, indexed: 'unique' }),
		verified: field.boolean({ default: false }),
		editor: field.boolean({ default: false }),
		profile: field.object({
			typeName: 'AuthorProfile',
			fields: (field) => ({
				contact: field.object({
					typeName: 'AuthorContact',
					fields: (field) => ({ email: field.string() }),
				}),
			}),
		}),
		// The inverse side of `Post.author`: no storage of its own.
		posts: field.relation({ target: () => Post, mappedBy: 'author' }),
	}),
}).with({
	relations: {
		// Readers see published posts through this relation; Master sees all.
		posts: {
			where: ({ context, where }) =>
				context.access.mode === 'master' ? where : where.eq('published', true),
		},
	},
})
//#endregion author

//#region post
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		// A unique field is a target of updateOne, deleteOne and upsertOne.
		slug: field.string({ required: true, indexed: 'unique' }),
		title: field.string({ required: true }),
		summary: field.string(),
		internalNote: field.string(),
		published: field.boolean({ default: false }),
		views: field.int({ default: 0 }),
		editCount: field.int({ default: 0 }),
		tags: field.string({ list: true }),
		metadata: field.json(),
		author: field.pointer({ target: () => Author }),
		comments: field.relation({ target: () => Comment }),
	}),
})
//#endregion post

//#region comment
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({
		body: field.string({ required: true }),
		published: field.boolean({ default: true }),
	}),
})
//#endregion comment

//#region translation
/** One translation per post and locale: the pair is a unique target. */
export const Translation = App.Schema.define({
	className: 'Translation',
	fields: (field) => ({
		post: field.pointer({
			target: () => Post,
			required: true,
			onDelete: 'cascade',
		}),
		locale: field.string({ required: true }),
		title: field.string({ required: true }),
	}),
	indexes: [{ fields: ['post', 'locale'], unique: true }],
})
//#endregion translation

//#region policies
/** Editors are Authors flagged `editor`; anonymous callers never are. */
export const isEditor: PolicyPredicate = async function isEditor({
	principal,
}) {
	if (principal === undefined) return false
	return Author.exists({ where: { id: principal.id, editor: true } })
}
//#endregion policies

//#region announcement
/** Signed-in authors announce; editors change; anonymous callers only read. */
export const Announcement = App.Schema.define({
	className: 'Announcement',
	fields: (field) => ({ title: field.string({ required: true }) }),
}).with({
	access: {
		read: true,
		create: {
			where: isAuthenticated,
			item: ({ item }) => {
				if (/https?:\/\//u.test(item.title)) {
					throw new PublicError('An announcement cannot contain a link.', {
						code: 'announcement.title-link',
						details: { field: 'title' },
					})
				}
				return true
			},
		},
		update: isEditor,
		delete: isEditor,
	},
})
//#endregion announcement
