import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/plugins/plugin-manifest-language-service.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-plugin-manifest.packed.fixture.ts',
)

describe('packed @ultimabase/core plugin manifests', () => {
	it('exports exact privilege completions and documented manifest types', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
		expect(languageFixture.readStringCompletions('privilege')).toEqual(
			expect.arrayContaining([
				'authority:elevate',
				'runtime:observe',
				'schema:declare',
				'typegen:replace',
			]),
		)
		expect(languageFixture.readStringCompletions('environment')).toStrictEqual([
			'environment:filesystem',
			'environment:native-code',
			'environment:network',
			'environment:process',
		])
		expect(languageFixture.readStringCompletions('cardinality')).toStrictEqual([
			'single',
			'multiple',
			'pipeline',
		])
		expect(languageFixture.readStringCompletions('lifetime')).toStrictEqual([
			'declaration',
			'application',
		])
		expect(languageFixture.readStringCompletions('policy-privilege')).toContain(
			'runtime:observe',
		)
		expect(languageFixture.readStringCompletions('policy-claim')).toContain(
			'environment:network',
		)
		expect(
			languageFixture
				.readMemberCompletions('policy-plugin')
				.map(({ name }) => name),
		).toContain('"fixture.policy-language-service"')
		expect(
			languageFixture
				.readMemberCompletions('policy-instance')
				.map(({ name }) => name),
		).toContain('editorial')
		const privilegeHover = languageFixture.readHover('privilege')
		expect(privilegeHover.display).toContain('type PluginPrivilege =')
		expect(privilegeHover.documentation).toContain('Core-enforceable power')
		expect(privilegeHover.hasExample).toBe(true)
		const environmentHover = languageFixture.readHover('environment')
		expect(environmentHover.display).toContain('type PluginEnvironmentClaim =')
		expect(environmentHover.documentation).toContain('direct Node.js behavior')
		expect(languageFixture.readHover('identity').display).toContain(
			'interface PluginIdentity',
		)
		expect(languageFixture.readHover('manifest').display).toContain(
			'interface PluginManifest',
		)
		expect(languageFixture.readHover('capability').display).toContain(
			'interface CapabilityToken',
		)
		expect(languageFixture.readHover('provider-value').display).toContain(
			'readonly endpoint: string;',
		)
		expect(languageFixture.readHover('decorator').display).toContain(
			'CapabilityDecoratorDeclaration',
		)
		expect(languageFixture.readHover('replacement').display).toContain(
			'CapabilityReplacementDeclaration',
		)
		expect(languageFixture.readHover('capability-chain').display).toContain(
			'interface CapabilityProviderChainInspection',
		)
		expect(languageFixture.readHover('policy').display).toContain(
			'interface PluginPrivilegePolicy',
		)
		expect(languageFixture.readHover('report').display).toContain(
			'interface PluginPrivilegeReport',
		)
	})
})
