import type { Metadata } from 'next'

import { NotFoundContent } from '../../components/not-found-content'

export const metadata: Metadata = {
	description: 'The requested UltimaBase page does not exist.',
	title: 'Page not found',
}

export default function NotFound() {
	return <NotFoundContent />
}
