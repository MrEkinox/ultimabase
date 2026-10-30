// The articles of a newsroom: who reads them, who writes them.
//#region model
import { graphql } from '@ultimabase/graphql'
import { allOf, allow, anyOf, defineModel } from 'ultimabase'
import type { Caller } from 'ultimabase'

/** The caller's user id, or `undefined` for anyone else. */
const userId = (caller: Caller) =>
	caller.kind === 'user' ? caller.user.id : undefined

export const Article = defineModel({
	name: 'Article',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		status: f.enumOf(['draft', 'published'], { default: 'draft' }),
		// Written once, with the caller's id: nobody signs for someone else.
		authorId: f.string({ default: ({ caller }) => userId(caller) }).with({
			access: {
				create: ({ caller, value }) => value === userId(caller),
				update: allow.private,
			},
		}),
		// The author's notes: other readers get the article without them.
		notes: f.string({ optional: true }).with<{ authorId: string }>({
			access: {
				read: ({ caller, record }) => record.authorId === userId(caller),
			},
		}),
		// Only the server features an article.
		featured: f.boolean({ default: false }).with({ access: allow.readOnly }),
	}),
}).with({
	access: {
		// Everyone reads what is published; an author reads their drafts too.
		read: anyOf(
			({ where }) => where({ status: 'published' }),
			({ caller, where }) =>
				caller.kind === 'user' && where({ authorId: caller.user.id }),
		),
		create: ({ caller }) => caller.kind === 'user',
		update: ({ caller, record }) => record.authorId === userId(caller),
		// An author deletes their own drafts, and nothing published.
		delete: allOf(
			({ caller, record }) => record.authorId === userId(caller),
			({ record }) => record.status === 'draft',
		),
	},
})
//#endregion
