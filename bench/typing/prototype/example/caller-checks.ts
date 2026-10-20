// `caller.user` takes the user model's type from one `Register` declaration
// (user.ts), in every model, without an import (D-24, D-62). `tsc` fails if
// one does not hold.
import type { Caller } from '../index.ts'
import { defineModel } from '../index.ts'
import type { UserOf } from '../rules.ts'
import { Post } from './post.ts'
import { User } from './user.ts'

type Equal<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Expect<T extends true> = T
type SignedIn = Extract<Caller, { readonly kind: 'user' }>['user']

export type CallerChecks = [
	Expect<Equal<SignedIn['id'], string>>,
	Expect<Equal<SignedIn['email'], string>>,
	Expect<Equal<SignedIn['role'], 'reader' | 'editor'>>,
	// Without a declaration, `caller.user` is `{ id }`.
	Expect<Equal<UserOf<{}>, { readonly id: string }>>,
]

// A field rule of another model, related to the user model, reads it too.
export const Note = defineModel({
	name: 'Note',
	fields: (f) => ({
		body: f.string().with({
			access: {
				read: ({ caller }) =>
					caller.kind === 'user' && caller.user.role === 'editor',
			},
		}),
		owner: f.one(() => User),
	}),
})

Post.with({
	access: {
		update: ({ caller }) =>
			caller.kind === 'user' &&
			// @ts-expect-error: `role` is 'reader' | 'editor'.
			caller.user.role === 'admin',
	},
})
export function unnarrowed(caller: Caller): void {
	// @ts-expect-error: `user` exists only when `kind` is 'user' (D-19).
	void caller.user
}
