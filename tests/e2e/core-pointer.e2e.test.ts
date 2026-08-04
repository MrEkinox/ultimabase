import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/pointer.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-pointer.packed.fixture.ts',
)

describe('packed @ultimabase/core pointer contracts', () => {
	it('type-checks the public pointer API from the built package', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	})

	it('keeps target values concise across every developer model', () => {
		const fieldDisplay = languageFixture.readHover('pointer-field').display

		expect(fieldDisplay).toContain('ResolvedPointerField<')
		expect(fieldDisplay).toContain('"PointerUser"')
		expect(fieldDisplay).not.toContain('CompactPointerFieldOptions<')

		for (const marker of [
			'pointer-value',
			'create-pointer',
			'update-pointer',
			'selected-pointer',
		]) {
			const display = languageFixture.readHover(marker).display

			expect(display).toContain('Pointer<SchemaClass<"PointerUser"')
			expect(display).not.toContain('FieldDefinition<')
			expect(display).not.toContain('any')
		}
	})
})
