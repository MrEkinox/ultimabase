import { pageSchema } from 'fumadocs-core/source/schema'
import { defineDocs } from 'fumadocs-mdx/config'
import { z } from 'zod'

const translationSchema = z.object({
	reviewedAt: z.iso.date(),
	source: z.string().startsWith('/docs'),
})

export const docs = defineDocs({
	dir: 'content/docs',
	docs: {
		schema: pageSchema.extend({
			description: z.string().trim().min(1),
			order: z.number().int().nonnegative().optional(),
			releaseStatus: z.enum(['pre-release', 'stable']),
			translation: translationSchema.optional(),
		}),
	},
})
