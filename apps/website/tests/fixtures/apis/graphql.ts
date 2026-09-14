import { randomUUID } from 'node:crypto'

import { application } from './running-application.js'

const graphql = application.application.getPlugin('@ultimabase/graphql-plugin')
const context = application.engine.anonymous({
	requestId: randomUUID(),
	source: 'internal',
}).context

export const result = await graphql.execute({
	context,
	document: `{
		findManyApiPost(first: 20, where: { published: { eq: true } }) {
			nodes { id title }
			pageInfo { hasNextPage endCursor }
		}
	}`,
})
