import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { UltimaBase } from '@ultimabase/core'

import { apiDatabasePlugin } from './fixtures/apis/test-database'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const contentRoot = fileURLToPath(
	new URL('../content/docs/en/operations/', import.meta.url),
)
const pages = [
	'application-lifecycle',
	'browser-policy',
	'configuration-and-environment',
	'postgres',
	'production-checklist',
	'secrets-and-master-key',
] as const

describe('operations documentation contracts', () => {
	it('executes the supported empty application lifecycle', async () => {
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [apiDatabasePlugin],
			schemas: [],
		})
		await expect(application.start()).resolves.toBeUndefined()
		await expect(application.dispose()).resolves.toBeUndefined()
	})

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
			'Browser-origin policy is disabled by default',
		)
		expect(documentation).toContain('health endpoint')
		expect(documentation).toContain('../security/master-authority')
		expect(documentation).toContain('../apis/http-applications')
	})
})
