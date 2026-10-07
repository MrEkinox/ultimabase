import { defineDocs } from 'fumadocs-mdx/config'

import { documentationPageSchema } from './lib/docs-content-contract'

export const docs = defineDocs({
	dir: 'content/docs',
	docs: {
		postprocess: {
			includeProcessedMarkdown: {
				mdxAsPlaceholder: [
					'Callout',
					'Card',
					'Cards',
					'CodeBlockTab',
					'CodeBlockTabs',
					'CodeBlockTabsList',
					'CodeBlockTabsTrigger',
					'File',
					'Files',
					'Folder',
					'Mermaid',
				],
			},
		},
		schema: documentationPageSchema,
	},
})
