// The functions: a query served under another name, a mutation, and one
// not served at all.
import { rest } from '@ultimabase/rest'
import { allow, defineFunction } from 'ultimabase'
import { z } from 'zod'
import { Post } from './models.ts'

//#region functions
export const topPosts = defineFunction({
	name: 'topPosts',
	use: [rest()],
	query: true,
	input: z.object({ count: z.int().min(1).max(10) }),
	output: [Post],
	run: ({ input, caller }) =>
		Post.findMany(
			{ orderBy: { likes: 'desc' }, take: input.count },
			{ as: caller },
		),
	// Served at GET /api/functions/trending.
}).with({ access: allow.public, rest: { name: 'trending' } })

export const like = defineFunction({
	name: 'like',
	use: [rest()],
	input: z.object({ slug: z.string() }),
	output: Post,
	// A number operation is for server code: a client's write sets values.
	run: ({ input, caller }) =>
		Post.update(
			{ where: { slug: input.slug }, data: { likes: { increment: 1 } } },
			{ as: caller },
		),
}).with({ access: allow.public })

export const reindex = defineFunction({
	name: 'reindex',
	use: [rest()],
	run: () => {},
	// Server code calls it; REST does not serve it.
}).with({ access: allow.public, rest: false })
//#endregion
