// The models: the posts users write, and the polls they vote in.
import {
	currentUser,
	isAuthenticated,
	isOwner,
	signedIn,
} from '@ultimabase/auth'
import { graphql } from '@ultimabase/graphql'
import { allow, anyOf, defineModel } from 'ultimabase'
import { User } from './user.ts'

export const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	//#region post-fields
	fields: (f) => ({
		title: f.string(),
		published: f.boolean({ default: false }),
		// Whoever creates the post.
		author: f.one(() => User, { default: currentUser }),
	}),
	//#endregion
}).with({
	//#region post-access
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
	//#endregion
})

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
//#endregion

//#region vote
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
