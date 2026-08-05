import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

interface IntelliSenseDocumentation {
	readonly documentation: string
	readonly hasExample: boolean
}

interface SchemaHoverCase {
	readonly label: string
	readonly source: string
}

const schemaOptionNames = [
	'access',
	'className',
	'extensions',
	'fields',
	'hooks',
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

/** Reads one marker through the same language-service path used by editor hovers. */
const readMarkedQuickInfo = (sourceWithMarker: string): ts.QuickInfo => {
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

	return quickInfo
}

/** Reads the documentation payload at one inserted schema property. */
const readMarkedHover = (
	sourceWithMarker: string,
): IntelliSenseDocumentation => {
	const quickInfo = readMarkedQuickInfo(sourceWithMarker)

	return readDocumentation(quickInfo.documentation, quickInfo.tags)
}

/** Protects the help text developers see without coupling tests to prose wording. */
const expectDocumented = (value: IntelliSenseDocumentation): void => {
	expect(value.documentation.trim()).not.toHaveLength(0)
	expect(value.hasExample).toBe(true)
}

const schemaHoverCases: readonly SchemaHoverCase[] = [
	{
		label: 'access',
		source:
			"Schema.define({ className: 'Post', /* hover */access: { operation: { read: true } }, fields: { title: stringField() } })",
	},
	{
		label: 'className',
		source:
			"Schema.define({ /* hover */className: 'Post', fields: { title: stringField() } })",
	},
	{
		label: 'fields',
		source:
			"Schema.define({ className: 'Post', /* hover */fields: { title: stringField() } })",
	},
	{
		label: 'indexes',
		source:
			"Schema.define({ className: 'Post', fields: { title: stringField() }, /* hover */indexes: [{ fields: ['title', 'createdAt'] }] })",
	},
	{
		label: 'extensions',
		source:
			"Schema.define({ className: 'Post', fields: {}, /* hover */extensions: [defineSchemaExtension('fixture.schema', {})] })",
	},
	{
		label: 'hooks',
		source:
			"Schema.define({ className: 'Post', fields: {}, /* hover */hooks: { beforeRead: ({ query }) => query } })",
	},
	{
		label: 'indexes.fields',
		source:
			"Schema.define({ className: 'Post', fields: { title: stringField() }, indexes: [{ /* hover */fields: ['title', 'createdAt'] }] })",
	},
	{
		label: 'indexes.unique',
		source:
			"Schema.define({ className: 'Post', fields: { title: stringField() }, indexes: [{ fields: ['title', 'createdAt'], /* hover */unique: true }] })",
	},
]

describe('Schema IntelliSense', () => {
	it('suggests and documents every schema option', () => {
		const fixture = createCompletionFixture(`
import { Schema, stringField } from '../../src/schema/index.js'

Schema.define({ /* completion */ })
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
import { Schema, stringField } from '../../src/schema/index.js'

Schema.define({
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

	it('documents the Schema constructor itself', () => {
		expectDocumented(
			readMarkedHover(`
import { Schema, stringField } from '../../src/schema/index.js'

const PostSchema = /* hover */Schema.define({
	className: 'Post',
	fields: { title: stringField() },
})
`),
		)
	})

	it('documents the Schema runtime guard', () => {
		expectDocumented(
			readMarkedHover(`
import { Schema } from '../../src/schema/index.js'

/* hover */Schema.is({})
`),
		)
	})

	it('keeps generated drafts and static Query access recognizable', () => {
		const draft = readMarkedQuickInfo(`
import { Schema, stringField } from '../../src/schema/index.js'

const Post = Schema.define({
	className: 'Post',
	fields: { title: stringField({ validation: { required: true } }) },
})
const draft = /* hover */new Post({ title: 'Hello' })
void draft
`)
		const query = readMarkedQuickInfo(`
import { Schema, stringField } from '../../src/schema/index.js'

const Post = Schema.define({
	className: 'Post',
	fields: { title: stringField({ validation: { required: true } }) },
})
const query = Post./* hover */query().select({ id: true, title: true })
void query
`)
		const draftDisplay = ts.displayPartsToString(draft.displayParts)
		const queryDisplay = ts.displayPartsToString(query.displayParts)
		const draftValueDisplay = draftDisplay.split('readonly create:')[0] ?? ''

		expect(draftDisplay).toContain('const Post: SchemaClass')
		expect(draftDisplay).toContain('title: string;')
		expect(draftValueDisplay).not.toContain('id: string;')
		expect(draftDisplay).not.toContain('NonDefaultedStringField<')
		expect(queryDisplay).toContain('query(): Query<')
		expect(ts.displayPartsToString(query.documentation)).toContain(
			'fresh immutable Query',
		)
	})

	it('keeps draft and persisted model commands distinct and documented', () => {
		const draftFixture = createCompletionFixture(`
import { Schema, stringField } from '../../src/schema/index.js'
const Post = Schema.define({
	className: 'Post',
	fields: { title: stringField({ validation: { required: true } }) },
})
new Post({ title: 'Hello' })./* completion */
`)
		const draftNames = new Set(draftFixture.completions.map(({ name }) => name))
		const persistedFixture = createCompletionFixture(`
import { Schema, stringField, type SchemaResult } from '../../src/schema/index.js'
const Post = Schema.define({
	className: 'Post',
	fields: { title: stringField({ validation: { required: true } }) },
})
declare const post: SchemaResult<typeof Post, { readonly title: string }>
post./* completion */
`)
		const persistedNames = new Set(
			persistedFixture.completions.map(({ name }) => name),
		)

		expect(draftNames.has('create')).toBe(true)
		expect(draftNames.has('upsert')).toBe(true)
		expect(draftNames.has('update')).toBe(false)
		expect(draftNames.has('delete')).toBe(false)
		expect(persistedNames.has('update')).toBe(true)
		expect(persistedNames.has('delete')).toBe(true)
		expect(persistedNames.has('create')).toBe(false)
		expect(persistedNames.has('upsert')).toBe(false)

		const create = readMarkedQuickInfo(`
import { Schema, stringField } from '../../src/schema/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
new Post({ title: 'Hello' })./* hover */create()
`)
		const update = readMarkedQuickInfo(`
import { Schema, stringField, type SchemaResult } from '../../src/schema/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
declare const post: SchemaResult<typeof Post, { readonly title: string }>
post./* hover */update({ title: 'Updated' })
`)
		const createDisplay = ts.displayPartsToString(create.displayParts)
		const updateDisplay = ts.displayPartsToString(update.displayParts)

		expect(createDisplay).toContain(
			'create(options?: QueryTerminalOptions): Promise<PersistedSchemaModel<',
		)
		expect(updateDisplay).toContain('update(input:')
		expect(updateDisplay).toContain('Promise<PersistedSchemaModel<')
		expect(createDisplay).not.toContain('NonDefaultedStringField<')
		expect(updateDisplay).not.toContain('NonDefaultedStringField<')
		expect(createDisplay.length).toBeLessThan(900)
		// Returning a complete mutation model adds one compact full-value argument.
		expect(updateDisplay.length).toBeLessThan(1_000)
		expectDocumented(readDocumentation(create.documentation, create.tags))
		expectDocumented(readDocumentation(update.documentation, update.tags))
	})

	it.each(schemaHoverCases)(
		'documents $label after insertion',
		({ source }) => {
			expectDocumented(
				readMarkedHover(`
import { Schema, defineSchemaExtension, stringField } from '../../src/schema/index.js'

${source}
`),
			)
		},
	)
})
