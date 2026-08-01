import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from './typescript-language-service.js'

interface IntelliSenseDocumentation {
	readonly documentation: string
	readonly hasExample: boolean
}

interface SchemaHoverCase {
	readonly label: string
	readonly source: string
}

const schemaOptionNames = [
	'className',
	'extensions',
	'fields',
	'indexes',
] as const
const schemaIndexOptionNames = ['fields', 'unique'] as const

/** Reads documentation consistently from QuickInfo and completion details. */
const readDocumentation = (
	documentation: readonly ts.SymbolDisplayPart[] | undefined,
	tags: readonly ts.JSDocTagInfo[] | undefined,
): IntelliSenseDocumentation => ({
	documentation: documentation?.map(({ text }) => text).join('') ?? '',
	hasExample: tags?.some(({ name }) => name === 'example') ?? false,
})

/** Creates one completion request at a source marker and preserves its position. */
const createCompletionFixture = (sourceWithMarker: string) => {
	const marker = '/* completion */'
	const position = sourceWithMarker.indexOf(marker)

	if (position < 0) {
		throw new TypeError('Missing schema completion marker')
	}

	const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
	const fileName = `${import.meta.dirname}/schema-completion.fixture.ts`
	const service = createLanguageService(fileName, source)
	const completions = service.getCompletionsAtPosition(fileName, position, {
		includeCompletionsWithInsertText: true,
	})

	if (completions === undefined) {
		throw new TypeError('Expected schema option completions')
	}

	return { completions: completions.entries, fileName, position, service }
}

/** Reads the hover payload at one inserted schema property. */
const readMarkedHover = (
	sourceWithMarker: string,
): IntelliSenseDocumentation => {
	const marker = '/* hover */'
	const markerPosition = sourceWithMarker.indexOf(marker)

	if (markerPosition < 0) {
		throw new TypeError('Missing schema hover marker')
	}

	const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
	const fileName = `${import.meta.dirname}/schema-hover.fixture.ts`
	const service = createLanguageService(fileName, source)
	const quickInfo = service.getQuickInfoAtPosition(
		fileName,
		markerPosition + marker.length,
	)

	if (quickInfo === undefined) {
		throw new TypeError('Expected schema hover information')
	}

	return readDocumentation(quickInfo.documentation, quickInfo.tags)
}

/** Protects the help text developers see without coupling tests to prose wording. */
const expectDocumented = (value: IntelliSenseDocumentation): void => {
	expect(value.documentation.trim()).not.toHaveLength(0)
	expect(value.hasExample).toBe(true)
}

const schemaHoverCases: readonly SchemaHoverCase[] = [
	{
		label: 'className',
		source:
			"defineSchema({ /* hover */className: 'Post', fields: { title: stringField() } })",
	},
	{
		label: 'fields',
		source:
			"defineSchema({ className: 'Post', /* hover */fields: { title: stringField() } })",
	},
	{
		label: 'indexes',
		source:
			"defineSchema({ className: 'Post', fields: { title: stringField() }, /* hover */indexes: [{ fields: ['title', 'createdAt'] }] })",
	},
	{
		label: 'extensions',
		source:
			"defineSchema({ className: 'Post', fields: {}, /* hover */extensions: [defineSchemaExtension('fixture.schema', {})] })",
	},
	{
		label: 'indexes.fields',
		source:
			"defineSchema({ className: 'Post', fields: { title: stringField() }, indexes: [{ /* hover */fields: ['title', 'createdAt'] }] })",
	},
	{
		label: 'indexes.unique',
		source:
			"defineSchema({ className: 'Post', fields: { title: stringField() }, indexes: [{ fields: ['title', 'createdAt'], /* hover */unique: true }] })",
	},
]

describe('defineSchema IntelliSense', () => {
	it('suggests and documents every schema option', () => {
		const fixture = createCompletionFixture(`
import { defineSchema, stringField } from '../src/index.js'

defineSchema({ /* completion */ })
`)
		const entries = fixture.completions.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)

		expect(entries.map(({ name }) => name).sort()).toStrictEqual(
			[...schemaOptionNames].sort(),
		)

		for (const entry of entries) {
			const details = fixture.service.getCompletionEntryDetails(
				fixture.fileName,
				fixture.position,
				entry.name,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)

			if (details === undefined) {
				throw new TypeError(`Missing schema completion details: ${entry.name}`)
			}

			expectDocumented(readDocumentation(details.documentation, details.tags))
		}
	})

	it('suggests and documents composite-index options', () => {
		const fixture = createCompletionFixture(`
import { defineSchema, stringField } from '../src/index.js'

defineSchema({
	className: 'Post',
	fields: { title: stringField() },
	indexes: [{ /* completion */ }],
})
`)
		const entries = fixture.completions.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)

		expect(entries.map(({ name }) => name).sort()).toStrictEqual(
			[...schemaIndexOptionNames].sort(),
		)

		for (const entry of entries) {
			const details = fixture.service.getCompletionEntryDetails(
				fixture.fileName,
				fixture.position,
				entry.name,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)

			if (details === undefined) {
				throw new TypeError(`Missing index completion details: ${entry.name}`)
			}

			expectDocumented(readDocumentation(details.documentation, details.tags))
		}
	})

	it('documents the defineSchema factory itself', () => {
		expectDocumented(
			readMarkedHover(`
import { defineSchema, stringField } from '../src/index.js'

const PostSchema = /* hover */defineSchema({
	className: 'Post',
	fields: { title: stringField() },
})
`),
		)
	})

	it.each(schemaHoverCases)(
		'documents $label after insertion',
		({ source }) => {
			expectDocumented(
				readMarkedHover(`
import { defineSchema, defineSchemaExtension, stringField } from '../src/index.js'

${source}
`),
			)
		},
	)
})
