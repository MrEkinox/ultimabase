import type { Metadata } from 'next'

import { ExamplesIndexPage } from '../../../components/examples/examples-page'
import { createPublicPageMetadata } from '../../../lib/metadata'

export default function ExamplesPage() {
	return <ExamplesIndexPage />
}

export function generateMetadata(): Metadata {
	return createPublicPageMetadata({
		canonicalPath: '/examples',
		description:
			'Run and understand the maintained UltimaBase minimal application through source-linked journeys.',
		title: 'Runnable examples',
	})
}
