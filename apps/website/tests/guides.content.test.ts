import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/guides/', import.meta.url),
)
const pages = ['generate-types', 'test-an-application'] as const

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

	it('keeps the Master key warning with Password Authentication', async () => {
		const source = await readFile(
			path.join(contentRoot, '../plugins/official/password-authentication.mdx'),
			'utf8',
		)

		expect(source).toContain('Keep `ULTIMABASE_MASTER_KEY` server-side.')
		expect(source).not.toMatch(
			/(?:browser|client).{0,80}X-UltimaBase-Master-Key/iu,
		)
	})
})
