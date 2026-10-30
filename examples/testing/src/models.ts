// Notes, each read and written by its owner only.
import { graphql } from '@ultimabase/graphql'
import { defineModel } from 'ultimabase'

export const Note = defineModel({
	name: 'Note',
	use: [graphql()],
	fields: (f) => ({
		text: f.string(),
		// The signed-in user who writes the note.
		ownerId: f.string({
			default: ({ caller }) =>
				caller.kind === 'user' ? caller.user.id : undefined,
		}),
	}),
}).with({
	access: {
		read: ({ caller, where }) =>
			caller.kind === 'user' && where({ ownerId: caller.user.id }),
		create: ({ caller }) => caller.kind === 'user',
	},
})
