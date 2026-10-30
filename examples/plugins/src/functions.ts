// The application's functions, which the rpc plugin serves.
//#region functions
import { allow, defineFunction } from 'ultimabase'
import { z } from 'zod'
import { Article } from './models.ts'

/** Who calls, as the plugins built the caller. */
export const whoami = defineFunction({
	name: 'whoami',
	query: true,
	output: z.object({ user: z.string().nullable(), editor: z.boolean() }),
	run: ({ caller }) =>
		caller.kind === 'user'
			? { user: caller.user.id, editor: caller.editor }
			: { user: null, editor: caller.kind === 'master' },
}).with({ access: allow.public })

/** The titles the caller reads: published ones, or every one for an editor. */
export const titles = defineFunction({
	name: 'titles',
	query: true,
	output: z.array(z.string()),
	run: async ({ caller }) => {
		const articles = await Article.findMany(
			{ orderBy: { title: 'asc' } },
			{ as: caller },
		)
		return articles.map((article) => article.title)
	},
}).with({ access: allow.public })
//#endregion
