import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/plugins/schema-compiler-ir-language-service.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-schema-compiler-ir.packed.fixture.ts',
)

describe('packed @ultimabase/core schema selectors', () => {
	it('exports documented schema selector contracts', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
		expect(
			languageFixture.readHover('option-presence-selector').display,
		).toContain('SchemaOptionPresenceSelector')
		expect(
			languageFixture.readHover('option-presence-selector').documentation,
		).toContain('normalized direct option is present')
		expect(
			languageFixture.readHover('option-absence-selector').display,
		).toContain('SchemaOptionAbsenceSelector')
		expect(
			languageFixture.readHover('option-absence-selector').documentation,
		).toContain('normalized direct option is absent')
		expect(
			languageFixture.readHover('option-equality-selector').display,
		).toContain('SchemaOptionEqualitySelector')
	})
})
