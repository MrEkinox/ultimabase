import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const factoryNames = [
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
	'string',
	'time',
	'uuid',
] as const
type FactoryName = (typeof factoryNames)[number]

const specificOptions: Readonly<Record<FactoryName, readonly string[]>> = {
	bigint: [],
	binary: [],
	boolean: [],
	date: [],
	dateTime: ['timezone'],
	decimal: ['precision', 'scale'],
	enum: ['values'],
	float: [],
	int: [],
	json: [],
	object: ['fields', 'typeName'],
	string: [],
	time: ['timezone'],
	uuid: [],
}

const builderMarker = '/* output-builder */'
const optionMarkers = new Map<FactoryName, string>()
const calls = factoryNames.map((factoryName) => {
	const marker = `/* output-options:${factoryName} */`
	optionMarkers.set(factoryName, marker)
	const incomplete = factoryName === 'enum' || factoryName === 'object'

	return `${incomplete ? '// @ts-expect-error -- Completion omits one required declaration property.\n' : ''}output.${factoryName}({ ${marker} })`
})
let source = `
import type { OutputBuilder } from '../../src/index.js'

declare const output: OutputBuilder
output.${builderMarker}string()
${calls.join('\n')}

// @ts-expect-error -- Output values have no persisted defaults.
output.string({ default: 'Ada' })
// @ts-expect-error -- \`required: false\` is the one word for a nullable output.
output.string({ nullable: true })
// @ts-expect-error -- Output values cannot own indexes.
output.string({ indexed: true })
// @ts-expect-error -- Output values do not expose relationships.
output.pointer({ target: 'User' })
`
const positions = new Map<string, number>()
for (const marker of [builderMarker, ...optionMarkers.values()]) {
	const position = source.indexOf(marker)
	if (position < 0) throw new TypeError(`Missing output marker: ${marker}`)
	positions.set(marker, position)
	source = source.replace(marker, ' '.repeat(marker.length))
}

const fileName = `${import.meta.dirname}/output-builder-autocomplete.fixture.ts`
const service = createLanguageService(fileName, source)

const readCompletions = (marker: string): readonly ts.CompletionEntry[] => {
	const position = positions.get(marker)
	if (position === undefined) throw new TypeError(`Unknown marker: ${marker}`)

	return (
		service.getCompletionsAtPosition(fileName, position, {
			includeCompletionsWithInsertText: true,
		})?.entries ?? []
	).filter(
		(entry) =>
			entry.kind === ts.ScriptElementKind.memberVariableElement ||
			entry.kind === ts.ScriptElementKind.memberFunctionElement,
	)
}

describe('OutputBuilder IntelliSense', () => {
	it('offers exactly the built-in output value kinds', () => {
		expect(
			readCompletions(builderMarker)
				.map(({ name }) => name)
				.sort(),
		).toStrictEqual(factoryNames)
	})

	it('offers only output-context options for every built-in kind', () => {
		for (const factoryName of factoryNames) {
			const marker = optionMarkers.get(factoryName)
			if (marker === undefined) throw new TypeError('Missing option marker')

			expect(
				readCompletions(marker)
					.map(({ name }) => name)
					.sort(),
				factoryName,
			).toStrictEqual(
				[
					'description',
					'list',
					'required',
					...specificOptions[factoryName],
				].sort(),
			)
		}
	})

	it('documents every output method and keeps the fixture type-safe', () => {
		for (const entry of readCompletions(builderMarker)) {
			const details = service.getCompletionEntryDetails(
				fileName,
				positions.get(builderMarker) ?? 0,
				entry.name,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)
			expect(
				ts.displayPartsToString(details?.documentation),
				entry.name,
			).not.toBe('')
		}

		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	})
})
