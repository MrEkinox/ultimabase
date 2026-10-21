import type { Caller } from '../index.ts'
import {
	allow,
	anyOf,
	softDelete,
	acl,
	graphql,
	defineModel,
} from '../index.ts'
import { Tag } from './tag.ts'
import { User } from './user.ts'

/** A plugin rule that reads the caller only (D-10). */
export declare function hasRole(
	role: string,
): (facts: { readonly caller: Caller }) => boolean

export const Post = defineModel({
	name: 'Post',
	use: [softDelete(), acl(), graphql()],
	fields: (f) => ({
		// Declared record: the fields the rules read, checked against the model.
		title: f.string().with<{ status: 'draft' | 'published' }>({
			access: {
				read: ({ record, caller }) =>
					record.status === 'published' ||
					(caller.kind === 'user' && caller.user.role === 'editor'),
				update: ({ record, value }) =>
					record.status === 'draft' && value.length > 0,
			},
		}),
		// Without a declaration: `value` and `record.id` are typed, the rest
		// `unknown`.
		status: f.enumOf(['draft', 'published'], { default: 'draft' }).with({
			access: {
				update: anyOf(
					({ record }) => record.status === 'draft',
					hasRole('editor'),
				),
			},
		}),
		views: f.number({ default: 0 }),
		pinned: f.boolean({ optional: true }),
		publishedAt: f.date({ optional: true }).with<{ views: number }>({
			access: {
				write: anyOf(
					({ caller }) => caller.kind === 'master',
					(facts) => facts.operation === 'update' && facts.record.views === 0,
				),
			},
		}),
		meta: f.json({ optional: true }),
		author: f
			.one(() => User, {
				onDelete: 'cascade',
				// Whoever creates the post (D-53).
				default: ({ caller }) =>
					caller.kind === 'user' ? caller.user : undefined,
			})
			.with({
				access: { create: allow.private, update: allow.private },
			}),
		reviewer: f.one(() => User, { optional: true }),
		tags: f.many(() => Tag),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'master' ||
			where({ status: 'published', author: { is: { role: 'editor' } } }),
		update: ({ record, caller }) =>
			record.status === 'draft' && caller.kind === 'user',
		write: ({ operation, caller }) =>
			operation === 'delete' ? caller.kind === 'master' : true,
	},
	hooks: {
		beforeCreate: ({ data }) => {
			void data.title.trim()
		},
		afterUpdateCommit: async ({ record }) => {
			await Promise.resolve(record.views)
		},
	},
	acl: { default: { read: allow.public }, ownerField: 'title' },
	graphql: { name: 'Article' },
})
