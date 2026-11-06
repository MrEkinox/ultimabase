// The articles of a newsroom: who reads them, who writes them.
//#region model
import { graphql } from '@ultimabase/graphql'
import { allOf, allow, anyOf, defineModel } from 'ultimabase'
import type { Caller } from 'ultimabase'

// A comment: everyone reads, and only a signed-in user creates; no one
// updates or deletes, as a missing key is closed.
export const Comment = defineModel({
	name: 'Comment',
	use: [graphql()],
	fields: (f) => ({ body: f.string() }),
}).with({
	access: {
		read: allow.public,
		create: ({ caller }) => caller.kind === 'user',
	},
})
//#endregion

//#region user-id
/** The caller's user id, or `undefined` for anyone else. */
const userId = (caller: Caller) =>
	caller.kind === 'user' ? caller.user.id : undefined
//#endregion

export const Article = defineModel({
	name: 'Article',
	use: [graphql()],
	fields: (f) => ({
		//#region field-author
		title: f.string(),
		status: f.enumOf(['draft', 'published'], { default: 'draft' }),
		// Written once, with the caller's id: nobody signs for someone else.
		authorId: f.string({ default: ({ caller }) => userId(caller) }).with({
			access: {
				create: ({ caller, value }) => value === userId(caller),
				update: allow.private,
			},
		}),
		//#endregion
		//#region field-notes
		// The author's notes: other readers get the article without them.
		notes: f.string({ optional: true }).with<{ authorId: string }>({
			access: {
				read: ({ caller, record }) => record.authorId === userId(caller),
			},
		}),
		//#endregion
		//#region field-featured
		// Only the server features an article.
		featured: f.boolean({ default: false }).with({ access: allow.readOnly }),
		//#endregion
	}),
}).with({
	access: {
		//#region article-read
		// Everyone reads what is published; an author reads their drafts too.
		read: anyOf(
			({ where }) => where({ status: 'published' }),
			({ caller, where }) =>
				caller.kind === 'user' && where({ authorId: caller.user.id }),
		),
		//#endregion
		//#region article-write
		create: ({ caller }) => caller.kind === 'user',
		update: ({ caller, record }) => record.authorId === userId(caller),
		// An author deletes their own drafts, and nothing published.
		delete: allOf(
			({ caller, record }) => record.authorId === userId(caller),
			({ record }) => record.status === 'draft',
		),
		//#endregion
	},
})
