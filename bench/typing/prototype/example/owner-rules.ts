// auth's `signedIn` and `isOwner` (D-79), combined with `anyOf` and `allOf`
// (D-81). `tsc` fails if one does not hold.
import { allOf, anyOf, defineModel, isOwner, signedIn } from '../index.ts'
import { User } from './user.ts'

export const Draft = defineModel({
	name: 'Draft',
	fields: (f) => ({
		text: f.string(),
		status: f.enumOf(['draft', 'published']),
		owner: f.one(() => User),
		editor: f.one(() => User, { optional: true }),
	}),
}).with({
	access: {
		// `user` is the registered user model's record.
		create: signedIn(({ user }) => user.role !== 'reader'),
		// Everyone reads published drafts; a user also reads their own (D-81).
		read: anyOf(
			({ where }) => where({ status: 'published' }),
			signedIn(({ user, where }) => where({ owner: { is: { id: user.id } } })),
		),
		update: anyOf(
			isOwner('editor'),
			signedIn(({ user }) => user.role === 'editor'),
			// The owner, while the draft is unpublished (D-81).
			allOf(isOwner('owner'), ({ record }) => record.status === 'draft'),
		),
		delete: isOwner('owner'),
	},
})

export const Mistakes = defineModel({
	name: 'Mistakes',
	fields: (f) => ({ text: f.string(), owner: f.one(() => User) }),
}).with({
	access: {
		// @ts-expect-error: `ownr` is not a `one` relation of the model.
		delete: isOwner('ownr'),
		// @ts-expect-error: `text` is not a relation.
		update: isOwner('text'),
		// @ts-expect-error: a read rule has no record to own.
		read: isOwner('owner'),
		// @ts-expect-error: `titel` is not a field of the record.
		create: signedIn(({ value }) => value.titel === ''),
	},
})

export const MoreMistakes = defineModel({
	name: 'MoreMistakes',
	fields: (f) => ({ text: f.string(), owner: f.one(() => User) }),
}).with({
	access: {
		read: allOf(
			signedIn(() => true),
			// @ts-expect-error: `txt` is not a field of the model.
			({ where }) => where({ txt: 'a' }),
		),
		// @ts-expect-error: only a read rule receives `where`.
		update: anyOf(isOwner('owner'), ({ where }) => where !== undefined),
	},
})
