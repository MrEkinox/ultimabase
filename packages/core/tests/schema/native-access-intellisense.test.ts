import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

interface CompletionResult {
	readonly documentation: string
	readonly hasExample: boolean
	readonly name: string
}

/** Reads one public helper hover without depending on its rendered signature. */
const readHelperDocumentation = (helperName: string): CompletionResult => {
	const marker = '/* hover */'
	const source = `
import { ${helperName} } from '../../src/index.js'

void ${marker}${helperName}
`
	const markerPosition = source.indexOf(marker)
	const fileName = `${import.meta.dirname}/native-access-helper-hover.fixture.ts`
	const service = createLanguageService(
		fileName,
		source.replace(marker, ' '.repeat(marker.length)),
	)
	const quickInfo = service.getQuickInfoAtPosition(
		fileName,
		markerPosition + marker.length,
	)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing Access helper hover: ${helperName}`)
	}

	return {
		documentation:
			quickInfo.documentation?.map(({ text }) => text).join('') ?? '',
		hasExample: quickInfo.tags?.some(({ name }) => name === 'example') ?? false,
		name: helperName,
	}
}

/** Reads member completions through the same language-service path as editors. */
const readMemberCompletions = (
	sourceWithMarker: string,
): CompletionResult[] => {
	const marker = '/* completion */'
	const position = sourceWithMarker.indexOf(marker)

	if (position < 0) {
		throw new TypeError('Missing native Access completion marker')
	}

	const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
	const fileName = `${import.meta.dirname}/native-access-completion.fixture.ts`
	const service = createLanguageService(fileName, source)
	const completions = service.getCompletionsAtPosition(fileName, position, {
		includeCompletionsWithInsertText: true,
	})

	if (completions === undefined) {
		throw new TypeError('Expected native Access member completions')
	}

	return completions.entries
		.filter(
			(entry) =>
				entry.kind === ts.ScriptElementKind.memberVariableElement ||
				entry.kind === ts.ScriptElementKind.memberFunctionElement,
		)
		.map((entry): CompletionResult => {
			const details = service.getCompletionEntryDetails(
				fileName,
				position,
				entry.name,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)

			if (details === undefined) {
				throw new TypeError(`Missing Access completion details: ${entry.name}`)
			}

			return {
				documentation:
					details.documentation?.map(({ text }) => text).join('') ?? '',
				hasExample:
					details.tags?.some(({ name }) => name === 'example') ?? false,
				name: entry.name,
			}
		})
}

/** Requires concise public help for every suggested grouped branch. */
const expectDocumentedNames = (
	completions: readonly CompletionResult[],
	names: readonly string[],
): void => {
	expect(completions.map(({ name }) => name).sort()).toStrictEqual(
		[...names].sort(),
	)

	for (const completion of completions) {
		expect(completion.documentation.trim(), completion.name).not.toHaveLength(0)
		expect(completion.hasExample, completion.name).toBe(true)
	}
}

describe('native Access IntelliSense', () => {
	it('documents every grouped schema read branch', () => {
		const completions = readMemberCompletions(`
import { Schema } from '../../src/schema/index.js'

Schema.define({
	className: 'Article',
	fields: {},
	access: { operation: { read: { /* completion */ } } },
})
`)

		expectDocumentedNames(completions, ['one', 'many', 'count', 'exists'])
	})

	it('offers only grouped read and mutation decisions on fields', () => {
		const completions = readMemberCompletions(`
import { stringField } from '../../src/schema/index.js'

stringField({ access: { /* completion */ } })
`)

		expectDocumentedNames(completions, ['read', 'create', 'update'])
	})

	it('documents every grouped field disclosure channel', () => {
		const completions = readMemberCompletions(`
import { stringField } from '../../src/schema/index.js'

stringField({ access: { read: { /* completion */ } } })
`)

		expectDocumentedNames(completions, ['item', 'filter', 'order'])
	})

	it('offers only documented predicates and logic on schema Access filters', () => {
		const completions = readMemberCompletions(`
import { Schema, booleanField, intField, stringField } from '../../src/schema/index.js'

Schema.define({
	className: 'Article',
	access: {
		filter: {
			read: ({ filter }) => {
				filter./* completion */

				return true
			},
		},
	},
	fields: {
		published: booleanField(),
		title: stringField(),
		views: intField(),
	},
})
`)

		expectDocumentedNames(completions, [
			'and',
			'containedIn',
			'contains',
			'doesNotExist',
			'endsWith',
			'equalTo',
			'exists',
			'greaterThan',
			'greaterThanOrEqualTo',
			'lessThan',
			'lessThanOrEqualTo',
			'matches',
			'not',
			'notContainedIn',
			'notEqualTo',
			'or',
			'startsWith',
		])
	})

	it('documents every plugin Access target from the setup facade', () => {
		const completions = readMemberCompletions(`
import { definePlugin } from '../../src/index.js'

definePlugin({
	name: 'fixture.access',
	setup: ({ access }) => {
		access./* completion */
	},
})
`)

		expectDocumentedNames(completions, [
			'field',
			'fieldExtension',
			'fieldKind',
			'global',
			'schema',
			'schemaExtension',
		])
	})

	it.each([
		'allowAll',
		'denyAll',
		'allOperations',
		'allMutations',
		'anyOf',
		'allOf',
		'not',
	])('documents the %s helper from the package root', (helperName) => {
		const documentation = readHelperDocumentation(helperName)

		expect(documentation.documentation.trim()).not.toHaveLength(0)
		expect(documentation.hasExample).toBe(true)
	})
})
