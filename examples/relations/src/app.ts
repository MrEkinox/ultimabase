// The application: a GraphQL API over HTTP on the relations' models.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { Author, Book, Publisher, Tag } from './models.ts'
import {
	Branch,
	Card,
	Category,
	Club,
	Member,
	Membership,
	Reader,
	Series,
	Transfer,
	Volume,
} from './shapes.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [
		Author,
		Publisher,
		Tag,
		Book,
		// The other shapes, used as Master only.
		Member,
		Card,
		Category,
		Branch,
		Transfer,
		Reader,
		Club,
		Membership,
		Series,
		Volume,
	],
})
