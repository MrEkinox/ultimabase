// The application: a GraphQL API over HTTP on the support tickets.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { Board, Card } from './cards.ts'
import { Activity, Call, Comment, Ticket } from './models.ts'
import { Tag } from './tag.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [Tag, Ticket, Activity, Comment, Call, Board, Card],
})
