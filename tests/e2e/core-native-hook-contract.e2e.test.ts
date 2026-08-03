import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/hooks/native-hook-contract.prototype.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-native-hook-contract.packed.fixture.ts',
)
const sourceFixture = await readFile(sourceFixtureFile, 'utf8')
const packedFixture = sourceFixture.replaceAll(
	"'../../src/index.js'",
	"'@ultimabase/core'",
)
const markerPattern = /\/\* (completion|hover):[a-z-]+ \*\//gu
const markerPositions = new Map<string, number>()

for (const match of packedFixture.matchAll(markerPattern)) {
	markerPositions.set(match[0], match.index)
}

const packedSource = packedFixture.replace(markerPattern, (marker) =>
	' '.repeat(marker.length),
)
const languageService = createLanguageService(packedFixtureFile, packedSource)

/** Resolves one stable marker from the shared source and packed fixture. */
const readMarkerPosition = (marker: string): number => {
	const position = markerPositions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Missing packed native hook marker: ${marker}`)
	}

	return position
}

/** Reads QuickInfo at the first token following one named hover marker. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(packedSource[position] ?? '')) {
		position += 1
	}

	const quickInfo = languageService.getQuickInfoAtPosition(
		packedFixtureFile,
		position,
	)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing packed native hook hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

describe('packed @ultimabase/core native hook contract', () => {
	it('type-checks the prototype through public package declarations', () => {
		expect(
			languageService.getSemanticDiagnostics(packedFixtureFile),
		).toStrictEqual([])
	})

	it('preserves exact schema, result, and field callback values', () => {
		expect(readHoverDisplay('create-input')).toContain('title: string;')
		expect(readHoverDisplay('update-input')).toContain('title?: string;')
		expect(readHoverDisplay('count-result')).toContain('number')
		expect(readHoverDisplay('enum-value')).toContain('"draft" | "published"')
		expect(readHoverDisplay('nullable-value')).toContain('string | null')
		expect(readHoverDisplay('custom-value')).toContain('VectorValue')
	})

	it('keeps field declarations independent from callback literals', () => {
		const display = readHoverDisplay('field-definition')

		expect(display).toContain('PrototypeField<')
		expect(display).not.toContain('resolveInput')
		expect(display).not.toContain('OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK')
	})

	it('preserves plugin-owned request value inference through package exports', () => {
		const display = readHoverDisplay('request-context-value')

		expect(display).toContain('FixturePrincipal | undefined')
		expect(display).not.toContain('unknown')
	})
})
