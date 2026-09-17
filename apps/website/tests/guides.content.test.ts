import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/guides/', import.meta.url),
)
const pages = ['generate-types'] as const

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

	it('teaches complete Typegen output before TypeScript checks', async () => {
		const typegen = await readFile(
			path.join(contentRoot, 'generate-types.mdx'),
			'utf8',
		)
		const usingPlugins = await readFile(
			path.join(contentRoot, '../plugins/using-plugins.mdx'),
			'utf8',
		)

		expect(typegen).toContain('writeGeneratedTypeFiles([')
		expect(typegen).toContain('generated.outputs.map(')
		expect(typegen).toContain(
			'"typecheck": "node --env-file=.env scripts/generate-types.mjs && tsc --noEmit"',
		)
		expect(typegen).toContain(
			'"build": "node --env-file=.env scripts/generate-types.mjs && tsc"',
		)
		expect(usingPlugins).toContain(
			'/docs/1.0.0/guides/generate-types#generate-before-building',
		)
	})
})
