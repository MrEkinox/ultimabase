import { llms } from 'fumadocs-core/source'

import { latest, source } from './source'
import type { Page } from './source'

/** Each page as Markdown, its includes replaced by their code (D-155). */
export const markdown = llms(source, {
	renderPage: async (page: Page) =>
		`# ${page.data.title}\n\n${page.data.description ?? ''}\n\n${(await page.data.getText('processed')).trim()}\n`,
})

/** The pages of the version `/docs` shows. */
export const latestPages = (): Page[] =>
	source.getPages().filter((page) => page.slugs[0] === latest)
