import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { documentationPlanSchema } from '../lib/docs-content-contract'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const websiteRoot = path.join(repositoryRoot, 'apps/website')
const comparisonRoot = path.join(websiteRoot, 'content/docs/1.0.0/comparison')
const comparisonSlugs = [
	'overview',
	'parse-server',
	'supabase',
	'firebase',
	'pocketbase',
	'appwrite',
	'prisma',
] as const

// Claims about other systems cite only their official sites and repositories.
const officialHosts = new Set([
	'appwrite.io',
	'docs.cloud.google.com',
	'docs.parseplatform.org',
	'firebase.google.com',
	'pocketbase.io',
	'supabase.com',
	'www.prisma.io',
])
const officialRepositories = [
	'https://github.com/MrEkinox/ultimadatabase/',
	'https://github.com/PostgREST/',
	'https://github.com/appwrite/',
	'https://github.com/firebase/',
	'https://github.com/parse-community/',
	'https://github.com/pocketbase/',
	'https://github.com/prisma/',
	'https://github.com/supabase/',
]

const readPage = (slug: string): Promise<string> =>
	readFile(path.join(comparisonRoot, `${slug}.mdx`), 'utf8')

const footnoteDefinitions = (source: string): ReadonlySet<string> =>
	new Set(
		[...source.matchAll(/^\[\^(?<label>[\w-]+)\]:/gmu)].flatMap((match) =>
			match.groups?.label === undefined ? [] : [match.groups.label],
		),
	)

const footnoteReferences = (source: string): ReadonlySet<string> =>
	new Set(
		[
			...source
				.replace(/^\[\^[\w-]+\]:.*$/gmu, '')
				.matchAll(/\[\^(?<label>[\w-]+)\]/gu),
		].flatMap((match) =>
			match.groups?.label === undefined ? [] : [match.groups.label],
		),
	)

describe('comparison documentation', () => {
	it('publishes the planned comparison pages in sidebar order', async () => {
		const plan = documentationPlanSchema.parse(
			JSON.parse(
				await readFile(
					path.join(websiteRoot, 'content/documentation-plan.json'),
					'utf8',
				),
			),
		)
		const section = plan.sections.find(({ slug }) => slug === 'comparison')
		expect(section?.pages.map(({ slug }) => slug)).toEqual(comparisonSlugs)

		const metadata = JSON.parse(
			await readFile(path.join(comparisonRoot, 'meta.json'), 'utf8'),
		) as { readonly pages: readonly string[] }
		expect(metadata.pages).toEqual(comparisonSlugs)
	})

	it.each(comparisonSlugs)(
		'%s cites official sources with their check date',
		async (slug) => {
			const source = await readPage(slug)
			expect(source).toMatch(/^reviewedAt: 2026-10-17$/mu)
			expect(source.replace(/\s+/gu, ' ')).toContain('checked on 2026-10-17')
			expect(source).toMatch(/^## Sources/mu)

			const sourcesBlock = /^sources:\n(?<paths>(?: {2}- .+\n)+)/mu.exec(source)
				?.groups?.paths
			for (const [, sourcePath] of sourcesBlock?.matchAll(/^ {2}- (.+)$/gmu) ??
				[]) {
				await expect(
					access(path.join(repositoryRoot, sourcePath ?? '')),
				).resolves.toBeUndefined()
			}

			const definitions = footnoteDefinitions(source)
			const references = footnoteReferences(source)
			expect(definitions.size, slug).toBeGreaterThan(0)
			expect(
				[...references].filter((label) => !definitions.has(label)),
			).toEqual([])
			expect(
				[...definitions].filter((label) => !references.has(label)),
			).toEqual([])

			for (const [href] of source.matchAll(/https?:\/\/[^\s)>"']+/gu)) {
				const url = new URL(href)
				const official =
					officialHosts.has(url.hostname) ||
					officialRepositories.some((prefix) => href.startsWith(prefix))
				expect(official, `${slug}: ${href}`).toBe(true)
			}
		},
	)

	it.each(comparisonSlugs)(
		'%s shows UltimaBase code only through tested example regions',
		async (slug) => {
			const source = await readPage(slug)
			expect(source).not.toMatch(/^\s*```/mu)
			for (const [, target] of source.matchAll(
				/<include cwd[^>]*>\s*(\S+)\s*<\/include>/gu,
			)) {
				expect(target).toMatch(/^\.\.\/\.\.\/examples\/[^#]+#[\w-]+$/u)
			}
		},
	)

	it('links every planned capability to the roadmap', async () => {
		const overview = await readPage('overview')
		const plannedLines = overview
			.split('\n')
			.filter((line) => line.startsWith('|') && line.includes('**Planned**'))
		expect(plannedLines.length).toBeGreaterThan(0)
		for (const line of plannedLines) {
			const cell = line
				.split('|')
				.find((candidate) => candidate.includes('**Planned**'))
			expect(cell, line).toMatch(/project\/roadmap|ROADMAP\.md#/u)
		}
	})

	it('keeps benchmarks a placeholder without numbers', async () => {
		const overview = await readPage('overview')
		const benchmarks = /^## Benchmarks\n(?<body>[\s\S]*?)^## /mu.exec(overview)
			?.groups?.body
		expect(benchmarks?.replace(/\s+/gu, ' ')).toContain(
			'Benchmarks are planned; they will be published with their scripts, versions and hardware.',
		)
		expect(benchmarks).not.toMatch(/\d/u)
	})
})
