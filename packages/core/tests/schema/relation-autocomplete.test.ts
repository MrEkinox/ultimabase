import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fileName = `${import.meta.dirname}/relation-autocomplete.fixture.ts`
const optionMarker = '/* relation-options */'
const mappedByMarker = '/* relation-mapped-by */'
const fieldMarker = '/* relation-field */'
const sourceWithMarkers = `
import { pointerField, relationField, Schema, stringField } from '../../src/index.js'

const User = Schema.define({ className: 'RelationAutocompleteUser', fields: {} })
const Post = Schema.define({
  className: 'RelationAutocompletePost',
  fields: {
    author: pointerField({ target: () => User }),
    title: stringField(),
  },
})
relationField({ target: () => Post, ${optionMarker} })
relationField({ target: () => Post, mappedBy: '${mappedByMarker}' })
const ${fieldMarker}posts = relationField({ target: () => Post, mappedBy: 'author' })
void posts
`
const markers = [optionMarker, mappedByMarker, fieldMarker] as const
const markerPositions = new Map<string, number>()
let source = sourceWithMarkers

for (const marker of markers) {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing relation IntelliSense marker: ${marker}`)
	}

	markerPositions.set(marker, position)
	source = source.replace(marker, ' '.repeat(marker.length))
}

const languageService = createLanguageService(fileName, source)

const readMarkerPosition = (marker: string): number => {
	const position = markerPositions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Unknown relation IntelliSense marker: ${marker}`)
	}

	return position
}

const readCompletions = (marker: string): readonly ts.CompletionEntry[] => {
	const completions = languageService.getCompletionsAtPosition(
		fileName,
		readMarkerPosition(marker),
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing relation completions at ${marker}`)
	}

	return completions.entries
}

describe('relationField IntelliSense', () => {
	it('suggests only portable relation options with documentation', () => {
		const entries = readCompletions(optionMarker).filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)

		expect(entries.map(({ name }) => name).sort()).toStrictEqual([
			'access',
			'description',
			'extensions',
			'mappedBy',
		])

		for (const entry of entries) {
			const details = languageService.getCompletionEntryDetails(
				fileName,
				readMarkerPosition(optionMarker),
				entry.name,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)

			expect(
				details?.documentation
					?.map(({ text }) => text)
					.join('')
					.trim(),
			).not.toBe('')
			expect(details?.tags?.some(({ name }) => name === 'example')).toBe(true)
		}
	})

	it('completes only compatible mappedBy field names', () => {
		const entries = readCompletions(mappedByMarker)

		expect(entries.map(({ name }) => name)).toContain('author')
		expect(entries.map(({ name }) => name)).not.toContain('title')
	})

	it('keeps the inferred hover focused on target and mapping', () => {
		const quickInfo = languageService.getQuickInfoAtPosition(
			fileName,
			readMarkerPosition(fieldMarker) + fieldMarker.length,
		)
		const display = ts.displayPartsToString(quickInfo?.displayParts)

		expect(display).toContain('RelationField<')
		expect(display).toContain('"RelationAutocompletePost"')
		expect(display).toContain('"author"')
		expect(display).not.toContain('RelationFieldOptions<')
	})
})
