// Bank accounts, each read by its owner only.
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
