import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fileName = `${import.meta.dirname}/pointer-autocomplete.fixture.ts`
const optionMarker = '/* pointer-options */'
const validationMarker = '/* pointer-validation */'
const fieldMarker = '/* pointer-field */'
const sourceWithMarkers = `
import { pointerField, Schema } from '../../src/index.js'

const User = Schema.define({ className: 'PointerAutocompleteUser', fields: {} })
pointerField({ ${optionMarker} })
const ${fieldMarker}author = pointerField({ target: () => User })
pointerField({ target: () => User, validation: { ${validationMarker} } })
void author
`
const markers = [optionMarker, validationMarker, fieldMarker] as const
const markerPositions = new Map<string, number>()
let source = sourceWithMarkers

for (const marker of markers) {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing pointer IntelliSense marker: ${marker}`)
	}

	markerPositions.set(marker, position)
	source = source.replace(marker, ' '.repeat(marker.length))
}

const languageService = createLanguageService(fileName, source)

/** Reads one stable marker position shared by completion and hover assertions. */
const readMarkerPosition = (marker: string): number => {
	const position = markerPositions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Unknown pointer IntelliSense marker: ${marker}`)
	}

	return position
}

/** Returns only object-property completions exposed by the pointer declaration. */
const readMemberCompletions = (
	marker: string,
): readonly ts.CompletionEntry[] => {
	const completions = languageService.getCompletionsAtPosition(
		fileName,
		readMarkerPosition(marker),
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing pointer completions at ${marker}`)
	}

	return completions.entries.filter(
		(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
	)
}

/** Confirms a completion carries useful documentation and an inline example. */
const expectDocumentedCompletion = (
	marker: string,
	entry: ts.CompletionEntry,
): void => {
	const details = languageService.getCompletionEntryDetails(
		fileName,
		readMarkerPosition(marker),
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

describe('pointerField IntelliSense', () => {
	it('suggests only supported pointer options with documentation', () => {
		const entries = readMemberCompletions(optionMarker)

		expect(entries.map(({ name }) => name).sort()).toStrictEqual([
			'access',
			'description',
			'extensions',
			'hooks',
			'immutable',
			'indexed',
			'list',
			'onDelete',
			'target',
			'validation',
		])

		for (const entry of entries) {
			expectDocumentedCompletion(optionMarker, entry)
		}
	})

	it('documents the complete presence contract', () => {
		const entries = readMemberCompletions(validationMarker)

		expect(entries.map(({ name }) => name).sort()).toStrictEqual(['required'])

		for (const entry of entries) {
			expectDocumentedCompletion(validationMarker, entry)
		}
	})

	it('keeps the inferred field hover focused on its target and presence', () => {
		const quickInfo = languageService.getQuickInfoAtPosition(
			fileName,
			readMarkerPosition(fieldMarker) + fieldMarker.length,
		)
		const display = ts.displayPartsToString(quickInfo?.displayParts)

		expect(display).toContain('ResolvedPointerField<')
		expect(display).toContain('"PointerAutocompleteUser"')
		expect(display).not.toContain('CompactPointerFieldOptions<')
		expect(display).not.toContain('FieldHooks')
		expect(display).not.toContain('FieldAccess')
	})
})
