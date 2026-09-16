import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
	documentationAudiences,
	documentationContentTypes,
	documentationPlanSchema,
	editorialTemplates,
} from '../lib/docs-content-contract'
import { documentationSections } from '../lib/docs-navigation'
import { currentDocumentationVersion } from '../lib/docs-versions'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = path.resolve(websiteRoot, '../..')

const outlineSchema = z.object({
	audience: z.enum(documentationAudiences),
	contentType: z.enum(documentationContentTypes),
	sections: z.array(z.string().trim().min(1)).min(1),
	title: z.string().trim().min(1),
})

async function readJson(filePath: string): Promise<unknown> {
	return JSON.parse(await readFile(filePath, 'utf8')) as unknown
}

async function sourcePathExists(source: string): Promise<boolean> {
	if (source.includes('*')) {
		const [prefix, suffix] = source.split('*')
		if (prefix === undefined || suffix === undefined) return false
		const parent = path.resolve(repositoryRoot, prefix)
		const packageDirectories = await readdir(parent, { withFileTypes: true })
		const candidatePaths = packageDirectories.flatMap((entry) => {
			if (!entry.isDirectory()) return []
			return [path.resolve(parent, entry.name, suffix.replace(/^\//u, ''))]
		})
		return Promise.all(
			candidatePaths.map((candidatePath) =>
				access(candidatePath)
					.then(() => true)
					.catch(() => false),
			),
		).then((matches) => matches.some(Boolean))
	}

	return access(path.resolve(repositoryRoot, source))
		.then(() => true)
		.catch(() => false)
}

async function publishedPageSlugs(
	directory: string,
): Promise<readonly string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const pages = await Promise.all(
		entries.map(async (entry) => {
			const entryPath = path.join(directory, entry.name)
			if (entry.isDirectory()) {
				return (await publishedPageSlugs(entryPath)).map(
					(slug) => `${entry.name}/${slug}`,
				)
			}
			return entry.name.endsWith('.mdx')
				? [entry.name.replace(/\.mdx$/u, '')]
				: []
		}),
	)
	return pages
		.flat()
		.map((slug) => slug.replace(/(?:^|\/)index$/u, '').replace(/\/$/u, ''))
}

describe('documentation editorial contract', () => {
	it('assigns every planned page a valid owner, outcome, type, and source', async () => {
		const parsed = documentationPlanSchema.parse(
			await readJson(path.join(websiteRoot, 'content/documentation-plan.json')),
		)
		const sectionIdentity = parsed.sections.map(({ label, slug }) => ({
			label,
			slug,
		}))
		expect(sectionIdentity).toEqual(documentationSections)

		const urls = [
			...parsed.sections.flatMap((section) =>
				section.pages.map(
					(page) =>
						`/docs/${currentDocumentationVersion.slug}/${section.slug}/${page.slug}`,
				),
			),
			...parsed.standalonePages.map(({ path: pagePath }) => pagePath),
		]
		expect(new Set(urls).size).toBe(urls.length)
		const issueFiles = await readdir(
			path.join(repositoryRoot, 'issues/2800-public-website-documentation'),
		)

		for (const item of [...parsed.sections, ...parsed.standalonePages]) {
			expect(
				issueFiles.some((fileName) => fileName.startsWith(`${item.owner}-`)),
			).toBe(true)

			for (const source of item.sources) {
				expect(await sourcePathExists(source), source).toBe(true)
			}
		}

		for (const section of parsed.sections) {
			const publishedSlugs = [
				await publishedPageSlugs(
					path.join(
						websiteRoot,
						'content/docs',
						currentDocumentationVersion.slug,
						section.slug,
					),
				),
			]
				.flat()
				.sort()
			expect(publishedSlugs, section.slug).toEqual(
				section.pages.map(({ slug }) => slug).sort(),
			)
		}

		expect(
			parsed.standalonePages.some(
				({ sourceStatus }) => sourceStatus === 'missing',
			),
		).toBe(false)
	})

	it('keeps one representative outline aligned with every page template', async () => {
		const outlines = z
			.array(outlineSchema)
			.parse(
				await readJson(
					path.join(websiteRoot, 'docs/representative-outlines.json'),
				),
			)
		expect(outlines.map(({ contentType }) => contentType).sort()).toEqual(
			[...documentationContentTypes].sort(),
		)

		for (const outline of outlines) {
			expect(outline.sections).toEqual(
				editorialTemplates[outline.contentType].requiredSections,
			)
		}
	})
})
