import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = path.join(
	import.meta.dirname,
	'public-api-language-service.fixture.ts',
)
const moduleSpecifier = '../src/index.js'

describe('@ultimabase/server-hono-plugin source declarations', () => {
	it('exposes only the deliberate application surface', () => {
		const marker = '/* exports */'
		const source = `import { ${marker} } from '${moduleSpecifier}'`
		const service = createLanguageService(fixtureFile, source)
		const completions =
			service
				.getCompletionsAtPosition(fixtureFile, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
				.filter((name) => name !== 'type')
				.sort() ?? []

		expect(completions).toStrictEqual([
			'ExistingHonoServerPluginOptions',
			'HonoServerPlugin',
			'HonoServerPluginOptions',
			'ManagedHonoServerPluginOptions',
			'honoServerPlugin',
		])
	})

	it('documents factory and ownership options in editor hovers', () => {
		const source = `
import { honoServerPlugin, type ExistingHonoServerPluginOptions, type ManagedHonoServerPluginOptions } from '${moduleSpecifier}'
const managed: ManagedHonoServerPluginOptions = { port: 1337 }
declare const external: ExistingHonoServerPluginOptions
honoServerPlugin(managed)
void external.app
`
		const service = createLanguageService(fixtureFile, source)
		const documentationAt = (needle: string): string =>
			service
				.getQuickInfoAtPosition(fixtureFile, source.lastIndexOf(needle))
				?.documentation?.map(({ text }) => text)
				.join('') ?? ''

		expect(documentationAt('honoServerPlugin')).toContain(
			'Creates one explicit Hono provider',
		)
		expect(documentationAt('port')).toContain('ephemeral port')
		expect(documentationAt('app')).toContain('listener remains developer-owned')
	})
})
