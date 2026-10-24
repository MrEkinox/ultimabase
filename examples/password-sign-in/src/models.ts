// The models: users who sign up with a password, and the posts they write.
import {
	currentUser,
	defineUser,
	isAuthenticated,
	isOwner,
	isSelf,
	signedIn,
} from '@ultimabase/auth'
import { graphql } from '@ultimabase/graphql'
import { password } from '@ultimabase/password'
import { allow, anyOf, defineModel } from 'ultimabase'

const nobody = () => false

export const User = defineUser({
	name: 'User',
	use: [graphql(), password()],
	fields: (f) => ({
		name: f.string(),
		// Only the server makes an editor: no client writes this field.
		editor: f
			.boolean({ default: false })
			.with({ access: { create: nobody, update: nobody } }),
		posts: f.many(() => Post, { inverse: 'author' }),
	}),
}).with({
	// Everyone reads names; each user changes their own.
	access: { read: allow.public, update: isSelf },
})

// Every rule, hook and function now reads `caller.user` as a `User`.
declare module 'ultimabase' {
	interface Register {
		readonly user: typeof User
	}
}

export const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		published: f.boolean({ default: false }),
		// Whoever creates the post.
		author: f.one(() => User, { default: currentUser }),
	}),
}).with({
	access: {
		// Everyone reads published posts; an author reads their drafts too.
		read: ({ caller, where }) =>
			caller.kind === 'user'
				? where({
						OR: [
							{ published: { equals: true } },
							{ author: { is: { id: { equals: caller.user.id } } } },
						],
					})
				: where({ published: { equals: true } }),
		create: isAuthenticated,
		update: isOwner('author'),
		// An author deletes their posts, an editor anyone's.
		delete: anyOf(
			isOwner('author'),
			signedIn(({ user }) => user.editor),
		),
	},
})
