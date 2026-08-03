import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

interface CompletionResult {
	readonly documentation: string
	readonly hasExample: boolean
	readonly name: string
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
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
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
})
