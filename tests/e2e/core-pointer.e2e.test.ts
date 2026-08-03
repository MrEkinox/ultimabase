import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/pointer.prototype.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-pointer.packed.fixture.ts',
)
const sourceFixture = await readFile(sourceFixtureFile, 'utf8')
const packedFixture = sourceFixture.replaceAll(
	"'../../src/index.js'",
	"'@ultimabase/core'",
)
const markerPattern = /\/\* hover:[a-z-]+ \*\//gu
const markerPositions = new Map<string, number>()

for (const match of packedFixture.matchAll(markerPattern)) {
	markerPositions.set(match[0], match.index)
}

const packedSource = packedFixture.replace(markerPattern, (marker) =>
	' '.repeat(marker.length),
)
const languageService = createLanguageService(packedFixtureFile, packedSource)

/** Reads one packed-consumer hover after its stable source marker. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	const markerPosition = markerPositions.get(marker)

	if (markerPosition === undefined) {
		throw new TypeError(`Missing packed pointer marker: ${marker}`)
	}

	let position = markerPosition + marker.length

	while (/\s/u.test(packedSource[position] ?? '')) {
		position += 1
	}

	const quickInfo = languageService.getQuickInfoAtPosition(
		packedFixtureFile,
		position,
	)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing packed pointer hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

describe('packed @ultimabase/core pointer contracts', () => {
	it('type-checks the public pointer API from the built package', () => {
		expect(
			languageService.getSemanticDiagnostics(packedFixtureFile),
		).toStrictEqual([])
	})

	it('keeps target values concise across every developer model', () => {
		const fieldDisplay = readHoverDisplay('pointer-field')

		expect(fieldDisplay).toContain('ResolvedPointerField<')
		expect(fieldDisplay).toContain('"PointerUser"')
		expect(fieldDisplay).not.toContain('CompactPointerFieldOptions<')

		for (const marker of [
			'pointer-value',
			'create-pointer',
			'update-pointer',
			'selected-pointer',
		]) {
			const display = readHoverDisplay(marker)

			expect(display).toContain('Pointer<SchemaClass<"PointerUser"')
			expect(display).not.toContain('FieldDefinition<')
			expect(display).not.toContain('any')
		}
	})
})
