import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contentRoot = fileURLToPath(
	new URL('../content/docs/en/1.0/concepts/', import.meta.url),
)
const planPath = fileURLToPath(
	new URL('../content/documentation-plan.json', import.meta.url),
)
const pages = [
	'application-graph',
	'runtime-pipeline',
	'request-context',
	'transactions',
	'logical-operations-and-persistence',
	'immutability',
	'typegen',
	'architecture-decisions',
] as const

interface DocumentationPlan {
	readonly sections: readonly {
		readonly owner: string
		readonly pages: readonly { readonly slug: string }[]
		readonly slug: string
	}[]
}

const readPage = (page: (typeof pages)[number]): Promise<string> =>
	readFile(path.join(contentRoot, `${page}.mdx`), 'utf8')

describe('cross-cutting concept documentation', () => {
	it('publishes exactly the approved mental models in sidebar order', async () => {
		const files = (await readdir(contentRoot))
			.filter((file) => file.endsWith('.mdx'))
			.map((file) => file.replace(/\.mdx$/u, ''))
		expect(files.sort()).toEqual([...pages].sort())

		const metadata: unknown = JSON.parse(
			await readFile(path.join(contentRoot, 'meta.json'), 'utf8'),
		)
		expect(metadata).toEqual({ title: 'Concepts', pages })
	})

	it('keeps every page concise, sourced, and connected to a task', async () => {
		for (const page of pages) {
			const source = await readPage(page)
			expect(source, page).toContain("owner: '2821'")
			expect(source, page).toContain('contentType: concept')
			expect(source, page).toContain('releaseStatus: pre-release')
			expect(source.match(/^## /gmu)?.length ?? 0, page).toBeGreaterThanOrEqual(
				2,
			)
			expect(source, page).toMatch(/\]\(\.\.\/(?:[^)]+)\)/u)

			const sourcesBlock = /^sources:\n(?<sources>(?: {2}- .+\n?)+)/mu.exec(
				source,
			)?.groups?.sources
			const sources = sourcesBlock
				?.split('\n')
				.map((line) => line.replace(/^ {2}- /u, ''))
				.filter(Boolean)
			expect(sources?.length ?? 0, page).toBeGreaterThan(0)
			for (const sourcePath of sources ?? []) {
				expect(
					await readFile(path.join(repositoryRoot, sourcePath), 'utf8').then(
						() => true,
						() => false,
					),
					`${page}: ${sourcePath}`,
				).toBe(true)
			}
		}
	})

	it('records the corrective owner in the public documentation plan', async () => {
		const plan = JSON.parse(
			await readFile(planPath, 'utf8'),
		) as DocumentationPlan
		const section = plan.sections.find(({ slug }) => slug === 'concepts')
		expect(section?.owner).toBe('2821')
		expect(section?.pages.map(({ slug }) => slug)).toEqual(pages)
	})

	it('states the non-negotiable Runtime and Typegen boundaries', async () => {
		const applicationGraph = await readPage('application-graph')
		const runtime = await readPage('runtime-pipeline')
		const context = await readPage('request-context')
		const persistence = await readPage('logical-operations-and-persistence')
		const typegen = await readPage('typegen')

		expect(applicationGraph).toContain(
			'Importing a package alone installs nothing',
		)
		expect(runtime).toContain('Policy contributions are monotonic')
		expect(context).toContain('None of them can manufacture Master authority')
		expect(persistence).toMatch(/do not enter the\s+replaceable plan/u)
		expect(typegen).toContain('generated declarations are absent')
	})
})
