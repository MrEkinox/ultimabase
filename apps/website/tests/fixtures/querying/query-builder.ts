import { QueryBuilder, type QueryScope } from '@ultimabase/core'

import { Post } from './schemas.js'

const published: QueryScope<typeof Post> = (query) =>
	query.where({ published: { eq: true } })

export const recentPublishedPosts = new QueryBuilder(Post)
	.select({ createdAt: true, title: true })
	.use(published)
	.descending('createdAt')
	.ascending('id')
	.limit(25)
	.build()
