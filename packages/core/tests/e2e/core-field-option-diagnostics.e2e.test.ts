import path from 'node:path'
import { describe, it } from 'vitest'

import { expectActionableFieldOptionDiagnostics } from '../schema/field-option-diagnostic-expectations.js'
import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/field-option-diagnostics.prototype.txt',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-field-option-diagnostics.packed.fixture.ts',
)

describe('packed @ultimabase/core field option diagnostics', () => {
	it('matches the actionable source diagnostics without arity failures', () => {
		expectActionableFieldOptionDiagnostics(languageFixture.diagnostics())
	})
})
