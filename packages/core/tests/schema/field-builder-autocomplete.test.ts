import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const rootMarker = '/* root-builder */'
const nestedMarker = '/* nested-builder */'
const optionMarker = '/* string-options */'
const hoverMarker = '/* string-hover */'
const pointerDeleteMarker = '/* pointer-on-delete */'
const sourceWithMarkers = `
import { Schema, type BaseSchemaTypeInfo } from '../../src/index.js'

declare module '../../src/index.js' {
  interface UltimaBaseGeneratedRegistryState {
    readonly application: true
  }
  interface UltimaBaseGeneratedSchemas {
    readonly FieldBuilderAutocomplete: BaseSchemaTypeInfo<'FieldBuilderAutocomplete'>
  }
}

Schema.define({
  className: 'FieldBuilderAutocomplete',
  fields: (field) => ({
	root: field.${rootMarker}string(),
    title: field.${hoverMarker}string({ ${optionMarker} }),
	assignee: field.pointer({
	  target: 'FieldBuilderAutocomplete',
	  onDelete: ${pointerDeleteMarker} 'restrict',
	}),
    profile: field.object({
      fields: (nested) => ({
		nested: nested.${nestedMarker}string(),
      }),
    }),
  }),
})
`
const markers = [
	rootMarker,
	nestedMarker,
	optionMarker,
	hoverMarker,
	pointerDeleteMarker,
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
const documentedMarker = '/* documented-builder */'
const documentedSourceWithMarker = `
import type { FieldBuilder } from '../../src/index.js'

declare const builder: FieldBuilder
builder.${documentedMarker}
`
const documentedPosition = documentedSourceWithMarker.indexOf(documentedMarker)
const documentedSource = documentedSourceWithMarker.replace(
	documentedMarker,
	' '.repeat(documentedMarker.length),
)
const documentedFileName = `${import.meta.dirname}/documented-field-builder.fixture.ts`
const documentedService = createLanguageService(
	documentedFileName,
	documentedSource,
)

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

const readStringCompletions = (marker: string): readonly string[] => {
	let position = readPosition(marker) + marker.length

	while (/\s/u.test(source[position] ?? '')) position += 1

	return (
		service.getCompletionsAtPosition(fileName, position + 1, {
			includeCompletionsWithInsertText: true,
		})?.entries ?? []
	)
		.map(({ name }) => name)
		.sort()
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

		const documentedEntries = documentedService
			.getCompletionsAtPosition(documentedFileName, documentedPosition, {
				includeCompletionsWithInsertText: true,
			})
			?.entries.filter(
				(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
			)

		if (documentedEntries === undefined) {
			throw new TypeError('Missing documented FieldBuilder completions')
		}

		for (const entry of documentedEntries) {
			const details = documentedService.getCompletionEntryDetails(
				documentedFileName,
				documentedPosition,
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

		expect(display).toContain('StringFieldOptions')

		const optionEntries = readMemberCompletions(optionMarker)

		expect(optionEntries.map(({ name }) => name)).toContain('validation')
		for (const entry of optionEntries) {
			expectDocumented(entry, readPosition(optionMarker))
		}
	})

	it('offers every pointer referential action', () => {
		expect(readStringCompletions(pointerDeleteMarker)).toStrictEqual([
			'cascade',
			'restrict',
			'setNull',
		])
	})

	it('has no semantic diagnostics', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	})
})
