import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	getStatusPage,
	statusPages,
	statusPageSlugs,
} from '../components/status/content'
import { siteConfig } from '../lib/site'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const planPath = fileURLToPath(
	new URL('../content/documentation-plan.json', import.meta.url),
)

interface DocumentationPlan {
	readonly standalonePages: readonly {
		readonly owner: string
		readonly path: string
		readonly sources: readonly string[]
		readonly sourceStatus: string
	}[]
}

describe('public status pages', () => {
	it('implements every approved status route with one corrective owner', async () => {
		const plan = JSON.parse(
			await readFile(planPath, 'utf8'),
		) as DocumentationPlan
		const implementedStandalonePages = [
			'/',
			siteConfig.routes.docs,
			'/docs/1.0.0/quick-start',
			siteConfig.routes.gettingStarted,
			...statusPageSlugs.map((slug) => `/status/${slug}`),
		]
		expect(plan.standalonePages.map(({ path: pagePath }) => pagePath)).toEqual(
			implementedStandalonePages,
		)

		const planned = plan.standalonePages.filter(({ path: pagePath }) =>
			pagePath.startsWith('/status/'),
		)

		expect(planned.map(({ path: pagePath }) => pagePath)).toEqual(
			statusPageSlugs.map((slug) => `/status/${slug}`),
		)
		expect(planned.every(({ owner }) => owner === '2822')).toBe(true)
		expect(
			planned.find(({ path: pagePath }) => pagePath.endsWith('contributing')),
		).toMatchObject({ sourceStatus: 'ready' })

		for (const page of planned) {
			for (const source of page.sources) {
				await expect(
					access(path.join(repositoryRoot, source)),
				).resolves.toBeUndefined()
			}
		}
	})

	it('keeps each page structured, linked, and free of release dates', () => {
		expect(statusPages.map(({ slug }) => slug)).toEqual(statusPageSlugs)
		for (const page of statusPages) {
			expect(page.sections).toHaveLength(3)
			expect(page.sections.every(({ items }) => items.length >= 2)).toBe(true)
			expect(page.title).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/u)
			expect(getStatusPage(page.slug)).toBe(page)

			const items = [
				page.primaryAction,
				...page.sections.flatMap(({ items }) => items),
			]
			for (const item of items) {
				if (item.href === undefined) continue
				if (item.external === true) {
					expect(item.href.startsWith(siteConfig.repositoryUrl.href)).toBe(true)
				} else {
					expect(item.href).toMatch(/^\/(?:docs|status)(?:\/|$)/u)
				}
			}
		}
	})

	it('states release, roadmap, and contribution boundaries explicitly', () => {
		const release = JSON.stringify(getStatusPage('release-status'))
		const roadmap = JSON.stringify(getStatusPage('roadmap'))
		const contributing = JSON.stringify(getStatusPage('contributing'))

		expect(release).toContain('does not announce a stable release')
		expect(release).toContain('No release date')
		expect(roadmap).toContain('Planned is not shipped')
		expect(roadmap).toContain('not delivery commitments')
		expect(roadmap).toContain('docs/adr/README.md')
		expect(roadmap).not.toContain('reference/architecture-decisions')
		expect(contributing).toContain('documentation impact')
		expect(contributing).toContain('humans remain responsible')
	})
})
