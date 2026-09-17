import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { siteConfig } from '../lib/site'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const projectRoot = path.join(websiteRoot, 'content/docs/1.0.0/project')
const projectSlugs = ['release-status', 'roadmap', 'contributing'] as const

interface DocumentationPlan {
	readonly sections: readonly {
		readonly slug: string
		readonly owner: string
		readonly sources: readonly string[]
		readonly pages: readonly { readonly slug: string }[]
	}[]
	readonly standalonePages: readonly { readonly path: string }[]
}

describe('project documentation', () => {
	it('publishes the three project pages under one docs section', async () => {
		const plan = JSON.parse(
			await readFile(
				path.join(websiteRoot, 'content/documentation-plan.json'),
				'utf8',
			),
		) as DocumentationPlan
		const project = plan.sections.find(({ slug }) => slug === 'project')
		expect(project?.owner).toBe('2822')
		expect(project?.pages.map(({ slug }) => slug)).toEqual(projectSlugs)
		expect(plan.standalonePages.map(({ path: pagePath }) => pagePath)).toEqual([
			'/',
			'/docs/1.0.0',
			'/docs/1.0.0/quick-start',
			'/docs/1.0.0/manual-installation',
		])

		const metadata = JSON.parse(
			await readFile(path.join(projectRoot, 'meta.json'), 'utf8'),
		) as { readonly pages: readonly string[] }
		expect(metadata.pages).toEqual(projectSlugs)
		for (const source of project?.sources ?? []) {
			await expect(
				access(path.join(repositoryRoot, source)),
			).resolves.toBeUndefined()
		}
	})

	it('keeps landing links on the versioned docs routes', () => {
		expect([
			siteConfig.routes.releaseStatus,
			siteConfig.routes.roadmap,
			siteConfig.routes.contributing,
		]).toEqual(projectSlugs.map((slug) => `/docs/1.0.0/project/${slug}`))
	})

	it('keeps release, roadmap, and contribution boundaries explicit', async () => {
		const [release, roadmap, contributing] = await Promise.all(
			projectSlugs.map((slug) =>
				readFile(path.join(projectRoot, `${slug}.mdx`), 'utf8'),
			),
		)
		expect(release).toContain('No release date')
		expect(release).toContain('not proof of a published `1.0.0` package')
		expect(roadmap).toContain('Planned is not shipped')
		expect(roadmap).toContain('not a delivery commitment')
		expect(roadmap).toContain('docs/adr/README.md')
		expect(contributing).toContain('documentation impact')
		expect(contributing).toContain('people remain responsible')
	})
})
