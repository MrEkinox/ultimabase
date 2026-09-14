import type { Metadata } from 'next'

import { NotFoundContent } from '../components/not-found-content'

import './globals.css'

export const metadata: Metadata = {
	description: 'The requested UltimaBase page does not exist.',
	title: 'Page not found · UltimaBase',
}

export default function GlobalNotFound() {
	return (
		<html lang="en">
			<body>
				<NotFoundContent />
			</body>
		</html>
	)
}
