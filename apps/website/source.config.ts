import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins'
import { defineConfig, defineDocs } from 'fumadocs-mdx/config'
import { transformerTwoslash } from 'fumadocs-twoslash'

import { documentationPageSchema } from './lib/docs-content-contract'
import { twoslashCompilerOptions } from './lib/twoslash'

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

export default defineConfig({
	mdxOptions: {
		rehypeCodeOptions: {
			...rehypeCodeDefaultOptions,
			transformers: [
				...(rehypeCodeDefaultOptions.transformers ?? []),
				// ADR-0330: only fences flagged `twoslash` are compiled, against the
				// built packages; a type error fails the site build.
				transformerTwoslash({
					explicitTrigger: true,
					twoslashOptions: { compilerOptions: twoslashCompilerOptions },
				}),
			],
		},
	},
})
