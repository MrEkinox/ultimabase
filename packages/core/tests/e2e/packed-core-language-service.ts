import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

export interface PackedCoreQuickInfo {
	readonly display: string
	readonly documentation: string
	readonly hasExample: boolean
}

export interface PackedCoreCompletion {
	readonly name: string
	readonly documentation: string
	readonly hasExample: boolean
}

export interface PackedCoreLanguageFixture {
	readonly diagnostics: () => readonly ts.Diagnostic[]
	readonly readMemberCompletions: (
		name: string,
	) => readonly PackedCoreCompletion[]
	readonly readStringCompletions: (name: string) => readonly string[]
	readonly readHover: (name: string) => PackedCoreQuickInfo
	readonly readSignatureParameterDocumentation: (
		name: string,
		parameterIndex: number,
	) => string
}

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
const markerPattern = /\/\* (?:completion|hover|signature):[a-z-]+ \*\//gu

const createCoreLanguageFixture = async (
	sourceFixtureFile: string,
	fixtureFile: string,
	transformSource: (source: string) => string,
): Promise<PackedCoreLanguageFixture> => {
	const sourceFixture = await readFile(sourceFixtureFile, 'utf8')
	const packedFixture = transformSource(sourceFixture)
	const markerPositions = new Map<string, number>()

	for (const match of packedFixture.matchAll(markerPattern)) {
		markerPositions.set(match[0], match.index)
	}

	const packedSource = packedFixture.replace(markerPattern, (marker) =>
		' '.repeat(marker.length),
	)
	// The fixtures construct applications without their own Register (ADR-0297).
	const languageService = createLanguageService(fixtureFile, packedSource, {
		register: true,
	})

	return {
		diagnostics: () => languageService.getSemanticDiagnostics(fixtureFile),
		readMemberCompletions: (name): readonly PackedCoreCompletion[] => {
			const marker = `/* completion:${name} */`
			const markerPosition = markerPositions.get(marker)

			if (markerPosition === undefined) {
				throw new TypeError(`Missing packed Core marker: ${marker}`)
			}

			const completions = languageService.getCompletionsAtPosition(
				fixtureFile,
				markerPosition,
				{ includeCompletionsWithInsertText: true },
			)

			if (completions === undefined) {
				throw new TypeError(`Missing packed Core completions: ${name}`)
			}

			return completions.entries
				.filter(
					(entry) =>
						entry.kind === ts.ScriptElementKind.memberVariableElement ||
						entry.kind === ts.ScriptElementKind.memberFunctionElement,
				)
				.map((entry) => {
					const details = languageService.getCompletionEntryDetails(
						fixtureFile,
						markerPosition,
						entry.name,
						undefined,
						entry.source,
						undefined,
						entry.data,
					)

					return {
						documentation: ts.displayPartsToString(details?.documentation),
						hasExample:
							details?.tags?.some(({ name }) => name === 'example') ?? false,
						name: entry.name,
					}
				})
		},
		readStringCompletions: (name): readonly string[] => {
			const marker = `/* completion:${name} */`
			const markerPosition = markerPositions.get(marker)

			if (markerPosition === undefined) {
				throw new TypeError(`Missing packed Core marker: ${marker}`)
			}

			let position = markerPosition + marker.length

			while (/\s/u.test(packedSource[position] ?? '')) {
				position += 1
			}

			const completions = languageService.getCompletionsAtPosition(
				fixtureFile,
				position + 1,
				{ includeCompletionsWithInsertText: true },
			)

			if (completions === undefined) {
				throw new TypeError(`Missing packed Core completions: ${name}`)
			}

			return completions.entries.map(({ name: entryName }) => entryName)
		},
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
				fixtureFile,
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
		readSignatureParameterDocumentation: (name, parameterIndex): string => {
			const marker = `/* signature:${name} */`
			const markerPosition = markerPositions.get(marker)

			if (markerPosition === undefined) {
				throw new TypeError(`Missing packed Core marker: ${marker}`)
			}

			const signature = languageService.getSignatureHelpItems(
				fixtureFile,
				markerPosition,
				undefined,
			)
			const parameter =
				signature?.items[signature.selectedItemIndex]?.parameters[
					parameterIndex
				]

			if (parameter === undefined) {
				throw new TypeError(
					`Missing packed Core signature parameter: ${name}[${String(parameterIndex)}]`,
				)
			}

			return ts.displayPartsToString(parameter.documentation)
		},
	}
}

/** Builds a language service over the repository source declarations. */
export const createSourceCoreLanguageFixture = async (
	sourceFixtureFile: string,
): Promise<PackedCoreLanguageFixture> =>
	createCoreLanguageFixture(
		sourceFixtureFile,
		sourceFixtureFile,
		(source) => source,
	)

/**
 * Builds one external-consumer language service from a source-level prototype.
 * The import rewrite ensures every assertion reads the built package declaration.
 * Optional extra source models application-local declaration merging without
 * adding generated contracts to the repository TypeScript program.
 */
export const createPackedCoreLanguageFixture = async (
	sourceFixtureFile: string,
	packedFixtureName: string,
	additionalSource = '',
): Promise<PackedCoreLanguageFixture> =>
	createCoreLanguageFixture(
		sourceFixtureFile,
		path.join(repositoryRoot, 'tests/e2e', packedFixtureName),
		(source) =>
			`${source
				.replaceAll("'../../src/index.js'", "'@ultimabase/core'")
				.replaceAll(
					"'../../src/plugin.js'",
					"'@ultimabase/core/plugin'",
				)}\n${additionalSource}`,
	)
