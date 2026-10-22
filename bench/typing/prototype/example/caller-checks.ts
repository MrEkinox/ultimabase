// `caller.user` takes the user model's type from one `Register` declaration
// (user.ts), in every model, without an import (D-24, D-62). `tsc` fails if
// one does not hold.
import type { Caller } from '../index.ts'
import {
	defineApp,
	defineModel,
	defineUser,
	graphqlPlugin,
	memory,
} from '../index.ts'
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
	// `defineUser` puts auth in the model's `use`, before the developer's.
	Expect<Equal<NonNullable<(typeof User)['plugins']>, 'auth' | 'graphql'>>,
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

// @ts-expect-error: a model uses 'auth', which is not in plugins.
defineApp({ database: memory(), plugins: [graphqlPlugin()], models: [User] })
// A second user model stops startup (D-62); only its types are checked here.
defineUser({
	name: 'Account',
	fields: (f) => ({ email: f.string() }),
}).with({
	// @ts-expect-error: the user model does not use graphql.
	graphql: { name: 'Account' },
})
