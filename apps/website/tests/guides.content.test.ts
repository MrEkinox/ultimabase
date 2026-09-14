import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(
	new URL('../content/docs/en/guides/', import.meta.url),
)
const pages = [
	'add-soft-delete',
	'add-virtual-fields',
	'build-an-authenticated-api',
	'filter-contextual-relations',
	'run-lifecycle-hooks',
	'test-an-application',
	'validate-input',
	'write-nested-data',
] as const

describe('focused guide contracts', () => {
	it('keeps every guide task-shaped and complete', async () => {
		for (const page of pages) {
			const source = await readFile(
				path.join(contentRoot, `${page}.mdx`),
				'utf8',
			)
			for (const heading of [
				'## Prerequisites',
				'## Shortest path',
				'## Verify the outcome',
				'## Limitations',
				'## Related concepts',
			]) {
				expect(source, `${page}: ${heading}`).toContain(heading)
			}
			expect(source, page).toMatch(/^outcome: .+$/mu)
			expect(source, page).toMatch(/```(?:ts|sh|http)\n/u)
		}
	})

	it('keeps trusted credentials out of client instructions', async () => {
		const sources = await Promise.all(
			pages.map((page) =>
				readFile(path.join(contentRoot, `${page}.mdx`), 'utf8'),
			),
		)
		const documentation = sources.join('\n')

		expect(documentation).toContain('Keep `ULTIMABASE_MASTER_KEY` server-side.')
		expect(documentation).not.toMatch(
			/(?:browser|client).{0,80}X-UltimaBase-Master-Key/iu,
		)
	})
})
