import { createFromSource } from 'fumadocs-core/search/server'

import { latest, source, versionOf } from '../../../lib/source'

export const revalidate = false

// Each page is tagged with its version, and the latest one's also `latest`.
export const { staticGET: GET } = createFromSource(source, {
	buildIndex: (page) => {
		const version = versionOf(page)
		return {
			id: page.url,
			url: page.url,
			title: page.data.title ?? page.url,
			...(page.data.description === undefined
				? {}
				: { description: page.data.description }),
			structuredData: page.data.structuredData,
			tag: version === latest ? [version, 'latest'] : version,
		}
	},
})
