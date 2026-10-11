import { describe, expect, it } from 'vitest'

import { createPublicApiLanguageServiceFixture } from '../../../tooling/vitest/typescript-language-service.js'

const moduleSpecifier = '../src/index.js'
const documentedSource = `
import { honoServerPlugin, type ExistingHonoServerPluginOptions, type ManagedHonoServerPluginOptions } from '${moduleSpecifier}'
const managed: ManagedHonoServerPluginOptions = { port: 1337 }
declare const external: ExistingHonoServerPluginOptions
honoServerPlugin(managed)
void external.app
`
const fixture = createPublicApiLanguageServiceFixture({
	directory: import.meta.dirname,
	documentedSource,
	moduleSpecifier,
})

describe('@ultimabase/hono-server-plugin source declarations', () => {
	it('exposes only the deliberate application surface', () => {
		expect(fixture.readExportCompletions()).toStrictEqual([
			'ExistingHonoServerPluginOptions',
			'HonoBrowserPolicyOwner',
			'HonoServerPlugin',
			'HonoServerPluginExports',
			'HonoServerPluginOptions',
			'ManagedHonoServerPluginOptions',
			'honoServerPlugin',
		])
	})

	it('documents factory and ownership options in editor hovers', () => {
		expect(fixture.documentationAt('honoServerPlugin')).toContain(
			'Creates one explicit Hono provider',
		)
		expect(fixture.documentationAt('port')).toContain('ephemeral port')
		expect(fixture.documentationAt('app')).toContain(
			'listener remains developer-owned',
		)
	})
})
