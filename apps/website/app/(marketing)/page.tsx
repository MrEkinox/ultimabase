import type { Metadata } from 'next'

import { LandingPage } from '../../components/landing/landing-page'
import { createPublicPageMetadata } from '../../lib/metadata'
import { siteConfig } from '../../lib/site'

export default function HomePage() {
	return <LandingPage />
}

export function generateMetadata(): Metadata {
	const metadata = createPublicPageMetadata({
		absoluteTitle: true,
		canonicalPath: '/',
		description: siteConfig.description,
		title: `${siteConfig.name} — TypeScript backend framework`,
	})
	return {
		...metadata,
		twitter: { ...metadata.twitter, card: 'summary_large_image' },
	}
}
