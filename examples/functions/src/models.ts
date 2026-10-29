// A lending library's books.
import { graphql } from '@ultimabase/graphql'
import { rest } from '@ultimabase/rest'
import { allow, defineModel } from 'ultimabase'

export const Book = defineModel({
	name: 'Book',
	use: [graphql(), rest()],
	fields: (f) => ({
		title: f.string({ search: true }),
		borrowedBy: f.string({ optional: true }),
	}),
}).with({ access: allow.readOnly })
