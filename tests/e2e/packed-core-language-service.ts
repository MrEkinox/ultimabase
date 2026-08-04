import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

export interface PackedCoreQuickInfo {
	readonly display: string
	readonly documentation: string
	readonly hasExample: boolean
}

export interface PackedCoreLanguageFixture {
	readonly diagnostics: () => readonly ts.Diagnostic[]
	readonly readHover: (name: string) => PackedCoreQuickInfo
}

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const markerPattern = /\/\* hover:[a-z-]+ \*\//gu

/**
 * Builds one external-consumer language service from a source-level prototype.
 * The import rewrite ensures every assertion reads the built package declaration.
 */
export const createPackedCoreLanguageFixture = async (
	sourceFixtureFile: string,
	packedFixtureName: string,
): Promise<PackedCoreLanguageFixture> => {
	const packedFixtureFile = path.join(
		repositoryRoot,
		'tests/e2e',
		packedFixtureName,
	)
	const sourceFixture = await readFile(sourceFixtureFile, 'utf8')
	const packedFixture = sourceFixture.replaceAll(
		"'../../src/index.js'",
		"'@ultimabase/core'",
	)
	const markerPositions = new Map<string, number>()

	for (const match of packedFixture.matchAll(markerPattern)) {
		markerPositions.set(match[0], match.index)
	}

	const packedSource = packedFixture.replace(markerPattern, (marker) =>
		' '.repeat(marker.length),
	)
	const languageService = createLanguageService(packedFixtureFile, packedSource)

	return {
		diagnostics: () =>
			languageService.getSemanticDiagnostics(packedFixtureFile),
		readHover: (name): PackedCoreQuickInfo => {
			const marker = `/* hover:${name} */`
			const markerPosition = markerPositions.get(marker)

			if (markerPosition === undefined) {
				throw new TypeError(`Missing packed Core marker: ${marker}`)
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
				throw new TypeError(`Missing packed Core hover: ${name}`)
			}

			return {
				display: ts.displayPartsToString(quickInfo.displayParts),
				documentation: ts.displayPartsToString(quickInfo.documentation),
				hasExample:
					quickInfo.tags?.some(({ name }) => name === 'example') ?? false,
			}
		},
	}
}
