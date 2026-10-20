// The user model, declared with auth's `defineUser` (D-13, D-62).
import type { Caller } from '../index.ts'
import { defineUser, graphql, isSelf } from '../index.ts'
import { Post } from './post.ts'

// A helper with a declared return type reads `caller.user` in any rule of
// the user model, which no longer needs its own annotation.
const isEditor = (caller: Caller): boolean =>
	caller.kind === 'user' && caller.user.role === 'editor'

export const User = defineUser({
	name: 'User',
	use: [graphql()],
	fields: (f) => ({
		email: f.string({ unique: true }).with({ access: { read: isSelf } }),
		// A field rule of the user model that reads `caller.user` itself
		// needs `: boolean`, or `User` cycles (TS7022, TS7023, D-62).
		role: f.enumOf(['reader', 'editor'], { default: 'reader' }).with({
			access: {
				update: ({ caller }): boolean =>
					caller.kind === 'user' && caller.user.role === 'editor',
			},
		}),
		posts: f.many(() => Post, { inverse: 'author' }),
		reviewed: f.many(() => Post, { inverse: 'reviewer' }),
		manager: f
			.one(() => User, { optional: true })
			.with({ access: { update: ({ caller }) => isEditor(caller) } }),
		// The same holds for a default reading `caller.user`: it declares its
		// return type, or `User` degrades silently (D-62).
		invitedBy: f.one(() => User, {
			optional: true,
			default: ({ caller }): { readonly id: string } | undefined =>
				caller.kind === 'user' ? caller.user : undefined,
		}),
	}),
	indexes: [{ fields: ['manager', 'role'] }],
}).with({
	graphql: { name: 'Member' },
	access: {
		read: ({ caller, where }) =>
			(caller.kind === 'user' && caller.user.role === 'editor') ||
			where({ manager: { is: null } }),
		update: ({ caller, record }) =>
			caller.kind === 'user' && caller.user.id === record.id,
	},
})

// The application types `caller.user` with its user model, once (D-24).
declare module '../rules.ts' {
	interface Register {
		readonly user: typeof User
	}
}
