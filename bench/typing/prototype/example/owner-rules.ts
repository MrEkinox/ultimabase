// auth's `signedIn` and `isOwner` (D-79). `tsc` fails if one does not hold.
import { anyOf, defineModel, isOwner, signedIn } from '../index.ts'
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
		read: signedIn(({ user, where }) =>
			where({
				OR: [{ status: 'published' }, { owner: { is: { id: user.id } } }],
			}),
		),
		update: anyOf(
			isOwner('owner'),
			isOwner('editor'),
			signedIn(
				({ user, record }) =>
					user.role === 'editor' && record.status === 'draft',
			),
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
