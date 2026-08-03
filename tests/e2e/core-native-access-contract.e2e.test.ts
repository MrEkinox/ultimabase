import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/native-access-contract.prototype.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-native-access-contract.packed.fixture.ts',
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

/** Reads public QuickInfo after one stable packed-consumer marker. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	const markerPosition = markerPositions.get(marker)

	if (markerPosition === undefined) {
		throw new TypeError(`Missing packed Access marker: ${marker}`)
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
		throw new TypeError(`Missing packed Access hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

describe('packed @ultimabase/core native Access contract', () => {
	it('type-checks declarations through the public package export', () => {
		expect(
			languageService.getSemanticDiagnostics(packedFixtureFile),
		).toStrictEqual([])
	})

	it('preserves exact operation, item, context-value, and field inference', () => {
		expect(readHoverDisplay('operation-kind')).toContain('"find"')
		expect(readHoverDisplay('context-value')).toContain('Principal | undefined')
		expect(readHoverDisplay('update-input')).toContain('authorId?: string')
		expect(readHoverDisplay('field-value')).toContain('boolean')
	})

	it('keeps native declarations outside the public Schema shape', () => {
		const display = readHoverDisplay('schema-definition')

		expect(display).toContain('SchemaClass<"AccessPost"')
		expect(display).not.toContain('readonly access')
		expect(display).not.toContain('operation:')
	})
})
