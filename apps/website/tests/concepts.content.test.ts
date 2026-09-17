import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/', import.meta.url),
)
const planPath = fileURLToPath(
	new URL('../content/documentation-plan.json', import.meta.url),
)
const pages = [
	'core/application',
	'core/runtime/runtime-pipeline',
	'core/runtime/transaction-boundaries',
	'core/runtime/logical-operations-and-persistence',
	'core/runtime/immutability',
] as const

interface DocumentationPlan {
	readonly sections: readonly {
		readonly owner: string
		readonly pages: readonly { readonly slug: string }[]
		readonly slug: string
	}[]
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null
}

const readPage = (page: (typeof pages)[number]): Promise<string> =>
	readFile(path.join(contentRoot, `${page}.mdx`), 'utf8')

describe('cross-cutting concept documentation', () => {
	it('places each approved mental model below its owning section', async () => {
		await expect(Promise.all(pages.map(readPage))).resolves.toHaveLength(
			pages.length,
		)

		const coreMetadata: unknown = JSON.parse(
			await readFile(path.join(contentRoot, 'core/meta.json'), 'utf8'),
		)
		expect(isRecord(coreMetadata)).toBe(true)
		if (!isRecord(coreMetadata)) throw new TypeError('Invalid Core metadata')
		expect(coreMetadata.title).toBe('Core')
		expect(coreMetadata.pages).toContain('application')
		expect(coreMetadata.pages).toContain('runtime')
	})

	it('keeps every page concise, sourced, and connected to a task', async () => {
		for (const page of pages) {
			const source = await readPage(page)
			expect(source, page).toContain('contentType: concept')
			expect(source, page).toContain('releaseStatus: pre-release')
			expect(source.match(/^## /gmu)?.length ?? 0, page).toBeGreaterThanOrEqual(
				2,
			)
			expect(source, page).toMatch(
				/\]\((?:\/docs\/1\.0\.0\/|\.\.\/)(?:[^)]+)\)/u,
			)

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
		const core = plan.sections.find(({ slug }) => slug === 'core')
		const reference = plan.sections.find(({ slug }) => slug === 'reference')
		expect(core?.owner).toBe('2824')
		expect([
			...(core?.pages.map(({ slug }) => `core/${slug}`) ?? []),
			...(reference?.pages.map(({ slug }) => `reference/${slug}`) ?? []),
		]).toEqual(expect.arrayContaining([...pages]))
	})

	it('states the non-negotiable Runtime and Typegen boundaries', async () => {
		const application = await readPage('core/application')
		const typegen = await readFile(
			path.join(contentRoot, 'guides/generate-types.mdx'),
			'utf8',
		)
		const runtime = await readPage('core/runtime/runtime-pipeline')
		const persistence = await readPage(
			'core/runtime/logical-operations-and-persistence',
		)

		expect(application).toContain('Importing a package alone installs nothing')
		expect(runtime).toContain('Policy contributions are monotonic')
		expect(application).toMatch(
			/request labels or plugin values cannot manufacture\s+Master access/u,
		)
		expect(persistence).toMatch(/do not enter the\s+replaceable plan/u)
		expect(typegen).toContain('not what UltimaBase executes')
		expect(application).not.toContain('## Optional Typegen')
	})
})
