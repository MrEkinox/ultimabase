import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contentRoot = fileURLToPath(
	new URL('../content/docs/1.0.0/', import.meta.url),
)
const pages = [
	'core/application',
	'plugins/official/http',
	'operations/configuration-and-environment',
	'plugins/official/postgresql',
	'operations/production-checklist',
	'operations/secrets',
] as const

describe('operations documentation contracts', () => {
	it('tracks maintained compatibility and operational limitations', async () => {
		const rootPackage: unknown = JSON.parse(
			await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
		)
		const documentation = (
			await Promise.all(
				pages.map((page) =>
					readFile(path.join(contentRoot, `${page}.mdx`), 'utf8'),
				),
			)
		).join('\n')

		expect(rootPackage).toMatchObject({
			engines: { node: '>=24.0.0' },
			packageManager: 'yarn@4.9.2',
		})
		expect(documentation).toContain('Node.js 24+')
		expect(documentation).toContain(
			'migration capability is planned separately',
		)
		expect(documentation).toContain(
			'Browser-origin behavior is disabled by default',
		)
		expect(documentation).toContain('health endpoint')
		expect(documentation).toContain(
			'/docs/1.0.0/core/security-foundations/master-authority',
		)
		expect(documentation).toContain('/docs/1.0.0/plugins/official/http')
	})
})
