import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/schema-targets.prototype.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-schema-targets.packed.fixture.ts',
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
		throw new TypeError(`Missing packed schema-target marker: ${marker}`)
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
		throw new TypeError(`Missing packed schema-target hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

describe('packed @ultimabase/core schema target contracts', () => {
	it('type-checks the public target boundary from the built package', () => {
		expect(
			languageService.getSemanticDiagnostics(packedFixtureFile),
		).toStrictEqual([])
	})

	it('preserves concise target, graph, and diagnostic hovers', () => {
		const targetDisplay = readHoverDisplay('schema-target')

		expect(targetDisplay).toContain('SchemaTarget<SchemaClass<"TargetUser"')
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
