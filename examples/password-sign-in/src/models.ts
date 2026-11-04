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
		// Everyone reads published posts; an author reads their drafts too:
		// `viewer` is the signed-in user, and no one for a visitor.
		read: ({ where }) =>
			where({
				OR: [{ published: { equals: true } }, { author: { viewer: true } }],
			}),
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

//#region poll
export const Poll = defineModel({
	name: 'Poll',
	use: [graphql()],
	fields: (f) => ({
		question: f.string(),
		votes: f.many(() => Vote, { inverse: 'poll' }),
		// A one view: the caller's own vote, or null.
		myVote: f.one(() => Vote, { from: 'votes' }),
		// An exists: whether the caller voted.
		hasVoted: f.exists(() => Vote, { from: 'votes' }),
	}),
}).with({
	// Read by all; the server asks the questions.
	access: allow.readOnly,
	relations: {
		myVote: { where: ({ where }) => where({ voter: { viewer: true } }) },
		hasVoted: { where: ({ where }) => where({ voter: { viewer: true } }) },
	},
})

export const Vote = defineModel({
	name: 'Vote',
	use: [graphql()],
	fields: (f) => ({
		choice: f.string(),
		poll: f.one(() => Poll),
		voter: f.one(() => User, { default: currentUser }),
	}),
	// One vote per user and poll: what keeps `myVote` single.
	indexes: [{ fields: ['poll', 'voter'], unique: true }],
}).with({
	access: { read: isAuthenticated, create: isOwner('voter') },
})
//#endregion
