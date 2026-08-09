import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const methodMarker = '/* vector-method */'
const hoverMarker = '/* vector-hover */'
const optionsMarker = '/* vector-options */'
const nameMarker = '/* vector-name */'
const sourceWithMarkers = `
import type { FieldBuilder } from '@ultimabase/core'
import type { VectorFieldBuilderMethod } from '../src/index.js'

declare const field: FieldBuilder & { readonly vector: VectorFieldBuilderMethod }
declare const validOptions: { readonly dimensions: 3 }

field.${methodMarker}vector('first', { dimensions: 3 })
field.${hoverMarker}vector('embedding', { ${optionsMarker}...validOptions })
field.vector(${nameMarker} 'signatureName', { dimensions: 3 })
`
const markers = [methodMarker, hoverMarker, optionsMarker, nameMarker] as const
const positions = new Map<string, number>()
let source = sourceWithMarkers

for (const marker of markers) {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing vector FieldBuilder marker: ${marker}`)
	}

	positions.set(marker, position)
	source = source.replace(marker, ' '.repeat(marker.length))
}

const fileName = `${import.meta.dirname}/field-builder-autocomplete.fixture.ts`
const service = createLanguageService(fileName, source)

const readPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Unknown vector FieldBuilder marker: ${marker}`)
	}

	return position
}

describe('pg-vector FieldBuilder IntelliSense', () => {
	it('completes and documents the generated vector method', () => {
		const position = readPosition(methodMarker)
		const completion = service
			.getCompletionsAtPosition(fileName, position, {
				includeCompletionsWithInsertText: true,
			})
			?.entries.find(({ name }) => name === 'vector')

		if (completion === undefined) {
			throw new TypeError('Missing vector FieldBuilder completion')
		}

		const details = service.getCompletionEntryDetails(
			fileName,
			position,
			completion.name,
			undefined,
			completion.source,
			undefined,
			completion.data,
		)

		expect(ts.displayPartsToString(details?.documentation)).toContain(
			'fixed-dimension logical vector',
		)
		expect(details?.tags?.some(({ name }) => name === 'example')).toBe(true)
	})

	it('retains the exact method and documented option contract', () => {
		const hover = service.getQuickInfoAtPosition(
			fileName,
			readPosition(hoverMarker) + hoverMarker.length,
		)

		expect(ts.displayPartsToString(hover?.displayParts)).toContain(
			'VectorFieldBuilderMethod',
		)
		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'fixed-dimension logical vector',
		)

		const optionNames =
			service
				.getCompletionsAtPosition(fileName, readPosition(optionsMarker), {})
				?.entries.map(({ name }) => name) ?? []

		expect(optionNames).toContain('dimensions')
		expect(optionNames).toContain('validation')
		expect(optionNames).toContain('hooks')

		const signature = service.getSignatureHelpItems(
			fileName,
			readPosition(nameMarker),
			undefined,
		)
		const nameParameter =
			signature?.items[signature.selectedItemIndex]?.parameters[0]

		expect(ts.displayPartsToString(nameParameter?.documentation)).toContain(
			'Stable logical field name',
		)
	})

	it('has no semantic diagnostics', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	})
})
