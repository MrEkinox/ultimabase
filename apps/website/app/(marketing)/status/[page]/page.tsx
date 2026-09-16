import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import {
	getStatusPage,
	isStatusPageSlug,
	statusPageSlugs,
} from '../../../../components/status/content'
import { StatusPage } from '../../../../components/status/status-page'
import { createPublicPageMetadata } from '../../../../lib/metadata'

interface StatusRouteProps {
	readonly params: Promise<{
		readonly page: string
	}>
}

export default async function StatusRoute({ params }: StatusRouteProps) {
	const { page } = await params
	if (!isStatusPageSlug(page)) notFound()

	const content = getStatusPage(page)
	return <StatusPage content={content} />
}

export function generateStaticParams() {
	return statusPageSlugs.map((page) => ({ page }))
}

export async function generateMetadata({
	params,
}: StatusRouteProps): Promise<Metadata> {
	const { page } = await params
	if (!isStatusPageSlug(page)) notFound()

	const content = getStatusPage(page)
	const canonicalPath = `/status/${page}`
	return createPublicPageMetadata({
		canonicalPath,
		description: content.description,
		title: content.eyebrow,
	})
}
