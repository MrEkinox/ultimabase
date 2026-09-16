import { defineDocs } from 'fumadocs-mdx/config'

import { documentationPageSchema } from './lib/docs-content-contract'

export const docs = defineDocs({
	dir: 'content/docs',
	docs: {
		postprocess: {
			includeProcessedMarkdown: true,
		},
		schema: documentationPageSchema,
	},
})
