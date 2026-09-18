import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { getLayoutTabs } from 'fumadocs-ui/layouts/shared'
import type { ReactNode } from 'react'

import { docsLayoutOptions } from '../../../lib/layout'
import {
	documentationPath,
	documentationVersions,
	type DocumentationVersion,
} from '../../../lib/docs-versions'
import { source } from '../../../lib/source'

const releaseStatusLabels = {
	'pre-release': 'Pre-release',
	stable: 'Stable',
} satisfies Record<DocumentationVersion['status'], string>

interface DocumentationLayoutProps {
	readonly children: ReactNode
}

export default function DocumentationLayout({
	children,
}: DocumentationLayoutProps) {
	const tree = source.getPageTree()
	// Keep each release label on Fumadocs' native version tab and menu item.
	const tabs = getLayoutTabs(tree).map((tab) => {
		const version = documentationVersions.find((candidate) => {
			const root = documentationPath('', candidate)
			return tab.url === root || tab.url.startsWith(`${root}/`)
		})
		if (!version) return tab

		return {
			...tab,
			title: (
				<span className="inline-flex items-center gap-2 whitespace-nowrap">
					{tab.title}
					<span className="inline-flex shrink-0 items-center rounded-full border border-fd-primary/30 bg-fd-primary/10 px-2 py-0.5 text-[0.6875rem] font-semibold leading-none text-fd-primary">
						{releaseStatusLabels[version.status]}
					</span>
				</span>
			),
		}
	})

	return (
		<DocsLayout {...docsLayoutOptions()} tabs={tabs} tree={tree}>
			{children}
		</DocsLayout>
	)
}
