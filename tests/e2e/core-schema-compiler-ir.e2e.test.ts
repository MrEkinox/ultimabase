import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/plugins/schema-compiler-ir-language-service.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-schema-compiler-ir.packed.fixture.ts',
)

describe('packed @ultimabase/core schema compiler IR', () => {
	it('exports the nominal callback-free protocol through package declarations', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
		expect(languageFixture.readHover('compiler-protocol').display).toContain(
			'"4.0.0"',
		)
		const input = languageFixture.readHover('compiler-input')
		expect(input.display).toContain('SchemaCompilerInput')
		expect(input.documentation).toContain('callback-free compilation request')
		expect(input.hasExample).toBe(true)
		expect(languageFixture.readHover('compiler-output').display).toContain(
			'SchemaCompilerOutput',
		)
		expect(languageFixture.readHover('compiler-artifact').display).toContain(
			'SchemaCompilerArtifactReference<"field">',
		)
		expect(languageFixture.readHover('compiler-capability').display).toContain(
			'CapabilityToken<SchemaCompilerProviderDescriptor',
		)
		expect(languageFixture.readHover('compiler-target').display).toContain(
			'CapabilityContributionTarget',
		)
		expect(languageFixture.readHover('compiler-provenance').display).toContain(
			'SchemaCompilerProvenance',
		)
		expect(languageFixture.readHover('compiler-replacement').display).toContain(
			'CapabilityReplacementDeclaration',
		)
		expect(
			languageFixture.readHover('option-presence-selector').display,
		).toContain('SchemaOptionPresenceSelector')
		expect(
			languageFixture.readHover('option-presence-selector').documentation,
		).toContain('normalized direct option is present')
		expect(
			languageFixture.readHover('option-equality-selector').display,
		).toContain('SchemaOptionEqualitySelector')
	})
})
