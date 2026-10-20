import type { Caller } from '../index.ts'
import { defineModel } from '../index.ts'
import { Post } from './post.ts'

/** auth's ready-made rule: the caller is this user (D-62). */
export declare function isSelf(facts: {
	readonly caller: Caller
	readonly record: { readonly id: string }
}): boolean

export const User = defineModel({
	name: 'User',
	fields: (f) => ({
		email: f.string({ unique: true }).with({ access: { read: isSelf } }),
		// A field rule of the user model written by hand that reads
		// `caller.user` needs `: boolean`, or `User` cycles (TS7022, D-24).
		role: f.enumOf(['reader', 'editor'], { default: 'reader' }).with({
			access: {
				update: ({ caller }): boolean =>
					caller.kind === 'user' && caller.user.role === 'editor',
			},
		}),
		posts: f.many(() => Post, { inverse: 'author' }),
		reviewed: f.many(() => Post, { inverse: 'reviewer' }),
		manager: f.one(() => User, { optional: true }),
	}),
}).with({
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
