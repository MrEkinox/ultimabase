import type { Caller } from '../index.ts'
import {
	allow,
	anyOf,
	boolean,
	date,
	enumOf,
	json,
	many,
	number,
	one,
	string,
} from '../index.ts'
import { App } from './app.ts'
import { Tag } from './tag.ts'
import { User } from './user.ts'

/** A plugin rule that reads the caller only (D-10). */
export declare function hasRole(
	role: string,
): (facts: { readonly caller: Caller }) => boolean

export const Post = App.defineModel({
	name: 'Post',
	softDelete: true,
	fields: {
		// Declared record: the fields the rules read, checked against the model.
		title: string().with<{ status: 'draft' | 'published' }>({
			access: {
				read: ({ record, caller }) =>
					record.status === 'published' || caller.kind === 'master',
				update: ({ record, value }) =>
					record.status === 'draft' && value.length > 0,
			},
		}),
		// Without a declaration: `value` and `record.id` are typed, the rest
		// `unknown`.
		status: enumOf(['draft', 'published'], { default: 'draft' }).with({
			access: {
				update: anyOf(
					({ record }) => record.status === 'draft',
					hasRole('editor'),
				),
			},
		}),
		views: number({ default: 0 }),
		pinned: boolean({ optional: true }),
		publishedAt: date({ optional: true }).with<{ views: number }>({
			access: {
				write: anyOf(
					({ caller }) => caller.kind === 'master',
					(facts) => facts.operation === 'update' && facts.record.views === 0,
				),
			},
		}),
		meta: json({ optional: true }),
		author: one(() => User, { onDelete: 'cascade' }).with({
			access: { create: allow.private, update: allow.private },
		}),
		reviewer: one(() => User, { optional: true }),
		tags: many(() => Tag),
	},
}).with({
	access: {
		read: ({ caller }) =>
			caller.kind === 'master' || {
				where: { status: 'published', author: { is: { role: 'editor' } } },
			},
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
