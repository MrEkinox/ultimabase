// The models: users who sign up with a password, and the posts they write.
//#region user
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

export const User = defineUser({
	name: 'User',
	use: [graphql(), password()],
	fields: (f) => ({
		name: f.string(),
		// Only the server makes an editor: no client writes this field.
		editor: f.boolean({ default: false }).with({ access: allow.readOnly }),
		posts: f.many(() => Post, { inverse: 'author' }),
	}),
}).with({
	// Signed-in users read each other's names; each user changes their own.
	access: { read: isAuthenticated, update: isSelf },
})

// Every rule, hook and function now reads `caller.user` as a `User`.
declare module 'ultimabase' {
	interface Register {
		readonly user: typeof User
	}
}
//#endregion

//#region post
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
		// A post is written in its author's name only: the caller's own.
		create: isOwner('author'),
		update: isOwner('author'),
		// An author deletes their posts, an editor anyone's.
		delete: anyOf(
			isOwner('author'),
			signedIn(({ user }) => user.editor),
		),
	},
})
//#endregion
