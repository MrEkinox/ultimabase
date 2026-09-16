import { docs } from '../.source/server'
import { llms, loader } from 'fumadocs-core/source'

export const source = loader({
	baseUrl: '/docs',
	source: docs.toFumadocsSource(),
})

/** Render the processed, versioned reader page as copyable Markdown. */
export const documentationMarkdown = llms(source, {
	renderPage: async (page) => {
		const content = (await page.data.getText('processed')).trim()
		return `# ${page.data.title} (${page.url})\n\n${content}\n`
	},
})
