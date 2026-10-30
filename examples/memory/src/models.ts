// An address book: names to sort and search, emails that are unique.
import { graphql } from '@ultimabase/graphql'
import { allow, defineModel } from 'ultimabase'

export const Contact = defineModel({
	name: 'Contact',
	use: [graphql()],
	fields: (f) => ({
		name: f.string({ search: true }),
		email: f.string({ unique: true }),
	}),
	// Open to every client, to keep the example on the database.
}).with({ access: allow.public })
