//#region factory
import { apiServer } from '@ultimabase/api-server'
import { PublicError, UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

import { sendMessage } from './effects.ts'
import { announcePost, postPublished } from './events.ts'

/**
 * The configured factory types `.with({ hooks })` and field `hooks` from the
 * plugin declaration. `postgresPlugin()` reads `DATABASE_URL` at start.
 */
export const App = UltimaBase.use(
	hooksPlugin({
		// Runs for every schema, before the schema's own Hooks.
		global: {
			afterCommit: {
				all: ({ schema, kind }) =>
					sendMessage({ to: 'audit', subject: `${schema}.${kind}` }),
			},
		},
		// Consumers of typed events, run after the commit.
		events: [announcePost],
	}),
	softDeletePlugin(),
	// Hooks are not an authorization layer: every client may write here.
	// Install Access before exposing an application.
	...apiServer({ http: { appId: 'blog' }, rest: { publicWrites: true } }),
	postgresPlugin(),
)
//#endregion factory

//#region targets
export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({ label: field.string({ required: true }) }),
})
//#endregion targets

//#region post
const slugify = (title: string) => title.toLowerCase().replace(/\s+/gu, '-')

export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		// A field Hook receives one present, non-null value.
		title: field.string({
			required: true,
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
		summary: field.string({
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
		slug: field.string(),
		published: field.boolean({ default: false, required: true }),
		views: field.int({ default: 0 }),
		author: field.pointer({ target: () => Author }),
		tags: field.relation({ target: () => Tag }),
	}),
	// A unique index of `define` is a unique target of `upsertOne`.
	indexes: [{ fields: ['slug'], unique: true }],
}).with({
	hooks: {
		// Plain data in, plain data out; `undefined` keeps the input.
		resolveInput: {
			create: ({ data }) => ({ ...data, slug: slugify(data.title) }),
			update: ({ changes }) =>
				changes.title === undefined
					? undefined
					: { ...changes, slug: slugify(changes.title) },
			upsert: ({ mode, data, changes }) =>
				mode === 'create'
					? { data: { ...data, slug: slugify(data.title) }, changes }
					: undefined,
		},
		beforeOperation: {
			update: ({ originalItem, item }) => {
				if (originalItem.published && item.title !== originalItem.title) {
					throw new PublicError('A published post keeps its title.', {
						code: 'post.published-title',
					})
				}
			},
		},
		// Inside the transaction: these writes and events commit with the post.
		afterOperation: {
			update: async ({ changes, context, originalItem, item }) => {
				if (changes.title !== undefined) {
					await PostTitleChange.createOne({
						data: {
							post: { connect: item.id },
							previousTitle: originalItem.title,
							title: item.title,
						},
					})
				}
				if (changes.published === true) {
					context.emit(postPublished, { postId: item.id, title: item.title })
				}
			},
		},
		// After the commit, outside it: external effects belong here.
		afterCommit: {
			create: ({ item }) =>
				sendMessage({ to: 'editors', subject: `New draft: ${item.title}` }),
			update: ({ changes, item }) =>
				sendMessage({ to: 'webhook', subject: item.id, body: changes }),
		},
	},
})
//#endregion post

//#region title-change
/** One row per title change, written in the post's transaction. */
export const PostTitleChange = App.Schema.define({
	className: 'PostTitleChange',
	fields: (field) => ({
		post: field.pointer({ target: () => Post, required: true }),
		previousTitle: field.string({ required: true }),
		title: field.string({ required: true }),
	}),
})
//#endregion title-change

//#region comment
/**
 * A thread whose comments count their replies at every level: updating a
 * parent re-enters the same Hook one level up, until the root.
 */
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (field) => ({
		body: field.string({ required: true }),
		parent: field.pointer({ target: () => Comment }),
		replies: field.int({ default: 0 }),
	}),
})
	.softDelete({ mode: 'command' })
	.with({
		hooks: {
			afterOperation: {
				create: ({ item }) => countReply(item.parent),
				update: ({ changes, item }) =>
					changes.replies === undefined ? undefined : countReply(item.parent),
			},
			afterCommit: {
				// `all` also runs for Soft Delete's commands; `kind` names them.
				all: async (input) => {
					if (input.kind === 'softDeleteOne') {
						await sendMessage({
							to: 'moderators',
							subject: `Hidden: ${input.originalItem.body}`,
						})
					}
				},
			},
		},
	})

const countReply = async (parent: { readonly id: string } | null) => {
	if (parent === null) return
	await Comment.updateOne({
		where: { id: { eq: parent.id } },
		data: { replies: { increment: 1 } },
	})
}
//#endregion comment
