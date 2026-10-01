import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/schema-targets.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-schema-targets.packed.fixture.ts',
)
const readHoverDisplay = (name: string): string =>
	languageFixture.readHover(name).display

describe('packed @ultimabase/core schema target contracts', () => {
	it('type-checks the public target boundary from the built package', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	})

	it('preserves concise target, graph, and diagnostic hovers', () => {
		const targetDisplay = readHoverDisplay('schema-target')

		expect(targetDisplay).toContain('SchemaTarget<ConfiguredSchemaResult<')
		expect(targetDisplay).toContain('"TargetUser"')
		expect(targetDisplay).not.toContain('any')
		expect(readHoverDisplay('target-graph')).toContain('SchemaTargetGraph')
		expect(readHoverDisplay('resolved-target')).toContain(
			'SchemaDefinition<string',
		)
		expect(readHoverDisplay('target-reason')).toContain(
			'SchemaTargetResolutionReason',
		)
	})
})
