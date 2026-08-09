import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const rootMarker = '/* root-builder */'
const nestedMarker = '/* nested-builder */'
const optionMarker = '/* string-options */'
const hoverMarker = '/* string-hover */'
const nameMarker = '/* string-name */'
const sourceWithMarkers = `
import { Schema } from '../../src/index.js'

Schema.define({
  className: 'FieldBuilderAutocomplete',
  fields(field) {
	field.${rootMarker}string('root')
    field.${hoverMarker}string('title', { ${optionMarker} })
	field.string(${nameMarker} 'signatureName')
    field.object('profile', {
      fields(nested) {
		nested.${nestedMarker}string('nested')
      },
    })
  },
})
`
const markers = [
	rootMarker,
	nestedMarker,
	optionMarker,
	hoverMarker,
	nameMarker,
] as const
const positions = new Map<string, number>()
let source = sourceWithMarkers

for (const marker of markers) {
	const position = source.indexOf(marker)

	if (position < 0) {
		throw new TypeError(`Missing FieldBuilder IntelliSense marker: ${marker}`)
	}

	positions.set(marker, position)
	source = source.replace(marker, ' '.repeat(marker.length))
}

const fileName = `${import.meta.dirname}/field-builder-autocomplete.fixture.ts`
const service = createLanguageService(fileName, source)

const readPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Unknown FieldBuilder IntelliSense marker: ${marker}`)
	}

	return position
}

const readMemberCompletions = (
	marker: string,
): readonly ts.CompletionEntry[] => {
	const completions = service.getCompletionsAtPosition(
		fileName,
		readPosition(marker),
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing FieldBuilder completions: ${marker}`)
	}

	return completions.entries.filter(
		(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
	)
}

const expectDocumented = (
	entry: ts.CompletionEntry,
	position: number,
): void => {
	const details = service.getCompletionEntryDetails(
		fileName,
		position,
		entry.name,
		undefined,
		entry.source,
		undefined,
		entry.data,
	)

	expect(
		ts.displayPartsToString(details?.documentation).trim(),
		`${entry.name} completion documentation`,
	).not.toBe('')
	expect(details?.tags?.some(({ name }) => name === 'example')).toBe(true)
}

const rootMethodNames = [
	'add',
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'pointer',
	'relation',
	'string',
	'time',
	'uuid',
] as const

describe('FieldBuilder IntelliSense', () => {
	it('suggests and documents every root builder method', () => {
		const entries = readMemberCompletions(rootMarker)

		expect(entries.map(({ name }) => name).sort()).toStrictEqual(
			rootMethodNames,
		)

		for (const entry of entries) {
			expectDocumented(entry, readPosition(rootMarker))
		}
	})

	it('removes relationship methods from embedded builders', () => {
		const names = readMemberCompletions(nestedMarker)
			.map(({ name }) => name)
			.sort()

		expect(names).toStrictEqual(
			rootMethodNames.filter(
				(name) => name !== 'pointer' && name !== 'relation',
			),
		)
	})

	it('retains method signatures and documented existing options', () => {
		const quickInfo = service.getQuickInfoAtPosition(
			fileName,
			readPosition(hoverMarker) + hoverMarker.length,
		)
		const display = ts.displayPartsToString(quickInfo?.displayParts)

		expect(display).toContain('name: string')
		expect(display).toContain('StringFieldOptions')
		expect(ts.displayPartsToString(quickInfo?.documentation).trim()).not.toBe(
			'',
		)
		expect(quickInfo?.tags?.some(({ name }) => name === 'example')).toBe(true)

		const optionEntries = readMemberCompletions(optionMarker)

		expect(optionEntries.map(({ name }) => name)).toContain('validation')
		for (const entry of optionEntries) {
			expectDocumented(entry, readPosition(optionMarker))
		}

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
