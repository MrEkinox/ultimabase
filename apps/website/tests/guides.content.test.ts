import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/guides/', import.meta.url),
)
const pages = ['test-an-application'] as const

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
			expect(source, page).toMatch(/```(?:ts|sh|http)(?: [^\n]+)?\n/u)
		}
	})

	it('keeps the Master key warning with Password Authentication', async () => {
		const source = await readFile(
			path.join(contentRoot, '../plugins/official/password-authentication.mdx'),
			'utf8',
		)

		expect(source).toContain('Keep any Master key server-side')
		expect(source).not.toMatch(
			/(?:browser|client).{0,80}X-UltimaBase-Master-Key/iu,
		)
	})

	it('types plugin options from source without a generation step', async () => {
		const usingPlugins = await readFile(
			path.join(contentRoot, '../plugins/using-plugins.mdx'),
			'utf8',
		)

		// ADR-0297: no Typegen; the application is declared once in Register.
		expect(usingPlugins).not.toContain("from '@ultimabase/typegen'")
		expect(usingPlugins).not.toContain('/docs/1.0.0/guides/generate-types')
		expect(usingPlugins).toContain("declare module '@ultimabase/core'")
		expect(usingPlugins).toContain('readonly app: typeof ultimabase')
	})

	it('tests application behavior in an isolated disposable database', async () => {
		const guide = await readFile(
			path.join(contentRoot, 'test-an-application.mdx'),
			'utf8',
		)
		// ADR-0327: the production application, one schema per worker.
		expect(guide).toContain('TEST_DATABASE_URL')
		expect(guide).toContain('await using t = await testApplication(ultimabase)')
		expect(guide).toContain('...ultimabaseTesting()')
		expect(guide).toContain('t.asMaster(')
		expect(guide).not.toContain('readVitestPoolId')
		expect(guide).not.toContain('yarn test:e2e:built')
	})
})
