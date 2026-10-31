// Bank accounts, each read by its owner only, and likes between users.
import { graphql } from '@ultimabase/graphql'
import { defineModel } from 'ultimabase'

export const Account = defineModel({
	name: 'Account',
	use: [graphql()],
	fields: (f) => ({
		number: f.string({ unique: true }),
		ownerId: f.string(),
		balance: f.number({ integer: true, default: 0 }),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'user' && where({ ownerId: caller.user.id }),
	},
})

//#region like-model
/** One user's like of another; two that face each other make a match. */
export const Like = defineModel({
	name: 'Like',
	fields: (f) => ({
		userId: f.string(),
		targetId: f.string(),
		matchedAt: f.dateTime({ optional: true }),
	}),
	// What `like` reads by: PostgreSQL tracks a serializable read by its index.
	indexes: [{ fields: ['userId', 'targetId'] }],
})
//#endregion
