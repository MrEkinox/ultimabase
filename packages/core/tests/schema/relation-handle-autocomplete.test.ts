import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const completionMarker = '/* completion */'
const methodMarker = '/* method */'
const handleMarker = '/* handle */'
const fileName = `${import.meta.dirname}/relation-handle-autocomplete.fixture.ts`
const sourceWithMarkers = `
import { relationField, Schema, stringField, type SchemaResult } from '../../src/index.js'

const Tag = Schema.define({
  className: 'RelationHandleTag',
  fields: () => ({ label: stringField() }),
})
const Post = Schema.define({
  className: 'RelationHandlePost',
  fields: () => ({
    relatedTags: relationField({ target: () => Tag }),
    title: stringField(),
  }),
})
declare const post: SchemaResult<typeof Post>
post./* method */relation('${completionMarker}')
const ${handleMarker}tags = post.relation('relatedTags')
void tags
`
const markers = [completionMarker, methodMarker, handleMarker] as const
const markerPositions = new Map<string, number>()
let source = sourceWithMarkers

for (const marker of markers) {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing Relation IntelliSense marker: ${marker}`)
	}

	markerPositions.set(marker, position)
	source = source.replace(marker, ' '.repeat(marker.length))
}

const languageService = createLanguageService(fileName, source)

const readMarkerPosition = (marker: string): number => {
	const position = markerPositions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Unknown Relation IntelliSense marker: ${marker}`)
	}

	return position
}

describe('Relation handle IntelliSense', () => {
	it('completes only relation field names', () => {
		const completions = languageService.getCompletionsAtPosition(
			fileName,
			readMarkerPosition(completionMarker),
			{ includeCompletionsWithInsertText: true },
		)

		if (completions === undefined) {
			throw new TypeError('Expected Relation field completions')
		}

		expect(completions.entries.map(({ name }) => name)).toContain('relatedTags')
		expect(completions.entries.map(({ name }) => name)).not.toContain('title')
	})

	it('documents the model accessor and keeps the handle hover focused', () => {
		const methodInfo = languageService.getQuickInfoAtPosition(
			fileName,
			readMarkerPosition(methodMarker) + methodMarker.length,
		)
		const handleInfo = languageService.getQuickInfoAtPosition(
			fileName,
			readMarkerPosition(handleMarker) + handleMarker.length,
		)
		const methodDocumentation =
			methodInfo?.documentation?.map(({ text }) => text).join('') ?? ''
		const handleDisplay = ts.displayPartsToString(handleInfo?.displayParts)

		expect(methodDocumentation).toContain('relationship handle')
		expect(methodInfo?.tags?.some(({ name }) => name === 'example')).toBe(true)
		expect(handleDisplay).toContain('Relation<')
		expect(handleDisplay).toContain('RelationHandlePost')
		expect(handleDisplay).toContain('RelationHandleTag')
		expect(handleDisplay).not.toContain('RelationFieldOptions')
	})
})
