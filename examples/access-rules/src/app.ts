// The application: a GraphQL API over HTTP on the articles and comments.
import { graphqlPlugin } from '@ultimabase/graphql'
import { httpPlugin } from '@ultimabase/http'
import { defineApp, memory } from 'ultimabase'
import { Article, Comment } from './models.ts'
import { Person, Project, Task } from './projects.ts'

export const app = defineApp({
	// Kept in memory, so the example needs no database.
	database: memory(),
	// Listens on PORT, or 3000.
	plugins: [httpPlugin(), graphqlPlugin()],
	models: [Article, Comment, Person, Project, Task],
})
