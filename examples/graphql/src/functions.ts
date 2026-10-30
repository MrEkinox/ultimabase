// The functions: one served under another name, one not served at all.
import { graphql } from '@ultimabase/graphql'
import { allow, defineFunction } from 'ultimabase'
import { z } from 'zod'
import { Post } from './models.ts'

//#region functions
export const topPosts = defineFunction({
	name: 'topPosts',
	use: [graphql()],
	query: true,
	input: z.object({ count: z.int().min(1).max(10) }),
	output: [Post],
	run: ({ input, caller }) =>
		Post.findMany(
			{ orderBy: { likes: 'desc' }, take: input.count },
			{ as: caller },
		),
	// Served as the query field `trending`.
}).with({ access: allow.public, graphql: { name: 'trending' } })

export const reindex = defineFunction({
	name: 'reindex',
	use: [graphql()],
	run: () => {},
	// Server code calls it; GraphQL does not serve it.
}).with({ access: allow.public, graphql: false })
//#endregion
