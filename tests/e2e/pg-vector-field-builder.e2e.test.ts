import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const methodMarker = '/* packed-vector-method */'
const hoverMarker = '/* packed-vector-hover */'
const optionsMarker = '/* packed-vector-options */'
const nameMarker = '/* packed-vector-name */'
const sourceWithMarkers = `
import type { FieldBuilder } from '@ultimabase/core'
import type { VectorFieldBuilderMethod, VectorValue } from '@ultimabase/pg-vector-plugin'

declare const field: FieldBuilder & { readonly vector: VectorFieldBuilderMethod }
declare const validOptions: { readonly dimensions: 3 }
declare const value: VectorValue

field.${methodMarker}vector('first', { dimensions: 3 })
field.${hoverMarker}vector('embedding', { ${optionsMarker}...validOptions })
field.vector(${nameMarker} 'signatureName', { dimensions: 3 })
void value
`
const markers = [methodMarker, hoverMarker, optionsMarker, nameMarker] as const
const positions = new Map<string, number>()
let source = sourceWithMarkers

for (const marker of markers) {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing packed vector marker: ${marker}`)
	}

	positions.set(marker, position)
	source = source.replace(marker, ' '.repeat(marker.length))
}

const fileName = path.join(
	import.meta.dirname,
	'pg-vector-field-builder.packed.fixture.ts',
)
const service = createLanguageService(fileName, source)

const readPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Unknown packed vector marker: ${marker}`)
	}

	return position
}

describe('packed @ultimabase/pg-vector-plugin FieldBuilder contract', () => {
	it('type-checks the generated method against package exports', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	})

	it('preserves documented method and option completions', () => {
		const methodPosition = readPosition(methodMarker)
		const method = service
			.getCompletionsAtPosition(fileName, methodPosition, {})
			?.entries.find(({ name }) => name === 'vector')

		if (method === undefined) {
			throw new TypeError('Missing packed vector completion')
		}

		const methodDetails = service.getCompletionEntryDetails(
			fileName,
			methodPosition,
			method.name,
			undefined,
			method.source,
			undefined,
			method.data,
		)

		expect(ts.displayPartsToString(methodDetails?.documentation)).toContain(
			'fixed-dimension logical vector',
		)
		expect(methodDetails?.tags?.some(({ name }) => name === 'example')).toBe(
			true,
		)

		const optionPosition = readPosition(optionsMarker)
		const dimension = service
			.getCompletionsAtPosition(fileName, optionPosition, {})
			?.entries.find(({ name }) => name === 'dimensions')

		if (dimension === undefined) {
			throw new TypeError('Missing packed vector dimensions completion')
		}

		const dimensionDetails = service.getCompletionEntryDetails(
			fileName,
			optionPosition,
			dimension.name,
			undefined,
			dimension.source,
			undefined,
			dimension.data,
		)

		expect(ts.displayPartsToString(dimensionDetails?.documentation)).toContain(
			'number of finite components',
		)
	})

	it('retains hover and name-parameter help', () => {
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
})
