import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
	exampleScenarios,
	exampleSourceUrl,
	minimalExampleCommand,
} from '../components/examples/content'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const documentationRoot = path.join(repositoryRoot, 'apps/website/content/docs')

async function readDocumentationPage(relativePath: string): Promise<string> {
	return readFile(
		path.join(documentationRoot, `${relativePath}.mdx`),
		'utf8',
	).catch(() =>
		readFile(path.join(documentationRoot, relativePath, 'index.mdx'), 'utf8'),
	)
}

describe('runnable example journeys', () => {
	it('keeps source regions exact and inside the maintained minimal example', async () => {
		for (const scenario of exampleScenarios) {
			for (const source of scenario.sources) {
				expect(source.path).toMatch(/^examples\/minimal\//u)
				const file = await readFile(
					path.join(repositoryRoot, source.path),
					'utf8',
				)
				const lines = file.split('\n')
				expect(source.startLine).toBeGreaterThan(0)
				expect(source.endLine).toBeLessThanOrEqual(lines.length)
				expect(source.endLine).toBeGreaterThanOrEqual(source.startLine)
				const region = lines
					.slice(source.startLine - 1, source.endLine)
					.join('\n')
				expect(region, `${scenario.slug}: ${source.label}`).toContain(
					source.expectedText,
				)
				expect(exampleSourceUrl(source)).toContain(
					`/${source.path}#L${String(source.startLine)}-L${String(source.endLine)}`,
				)
			}
		}
	})

	it('links every journey to one concept, task guide, and reference page', async () => {
		const slugs = new Set<string>()
		for (const scenario of exampleScenarios) {
			expect(slugs.has(scenario.slug)).toBe(false)
			slugs.add(scenario.slug)
			expect(scenario.documentation.map((link) => link.kind).sort()).toEqual([
				'Concept',
				'Reference',
				'Task guide',
			])

			for (const link of scenario.documentation) {
				const relativePath = link.href.replace(/^\/docs\/?/u, '')
				await expect(readDocumentationPage(relativePath)).resolves.toContain(
					'title:',
				)
			}
		}
	})

	it('publishes the real workspace start command and documented endpoints', async () => {
		const packageSource = await readFile(
			path.join(repositoryRoot, 'examples/minimal/package.json'),
			'utf8',
		)
		const packageJson: unknown = JSON.parse(packageSource)
		expect(packageJson).toMatchObject({
			name: '@ultimabase/example-minimal',
			scripts: { start: 'node src/main.ts' },
		})
		expect(minimalExampleCommand).toBe(
			'corepack yarn workspace @ultimabase/example-minimal start',
		)

		const readme = await readFile(
			path.join(repositoryRoot, 'examples/minimal/README.md'),
			'utf8',
		)
		expect(readme).toContain(minimalExampleCommand)
		expect(readme).toContain('http://127.0.0.1:1337')
		expect(readme).toContain('REST is mounted under `/api/v1`')
		expect(readme).toContain('GraphQL accepts `POST /graphql`')
	})
})
