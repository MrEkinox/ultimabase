import { docs } from '../.source/server'
import { llms, loader } from 'fumadocs-core/source'
import { lucideIconsPlugin } from 'fumadocs-core/source/plugins/lucide-icons'

import { renderDocumentationMarkdown } from './docs-markdown'

export const source = loader({
	baseUrl: '/docs',
	plugins: [lucideIconsPlugin()],
	source: docs.toFumadocsSource(),
})

/** Render the processed, versioned reader page as copyable Markdown. */
export const documentationMarkdown = llms(source, {
	renderPage: async (page) => {
		const content = (
			await renderDocumentationMarkdown(await page.data.getText('processed'))
		).trim()
		return `# ${page.data.title} (${page.url})\n\n${content}\n`
	},
})
