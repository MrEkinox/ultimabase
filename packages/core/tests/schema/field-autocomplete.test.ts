import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fieldFactoryNames = [
	'bigintField',
	'binaryField',
	'booleanField',
	'dateField',
	'dateTimeField',
	'decimalField',
	'enumField',
	'floatField',
	'intField',
	'jsonField',
	'objectField',
	'stringField',
	'timeField',
	'uuidField',
] as const

type FieldFactoryName = (typeof fieldFactoryNames)[number]
type FactoryOptionMap = Readonly<Record<FieldFactoryName, readonly string[]>>

interface FieldCompletionCase {
	readonly factoryName: FieldFactoryName
	readonly invocationPrefix: string
	readonly invocationSuffix?: string
	readonly options: readonly string[]
}

interface FieldInvocation {
	readonly prefix: string
	readonly suffix?: string
}

interface IntelliSenseDocumentation {
	readonly documentation: string
	readonly hasExample: boolean
}

interface FieldOptionHoverCase {
	readonly factoryName: FieldFactoryName
	readonly optionName: string
	readonly source: string
}

interface CompactFieldSignatureCase {
	readonly factoryName: FieldFactoryName
	readonly imports?: readonly FieldFactoryName[]
	readonly expression: string
	readonly expectedReturn: string
}

interface FieldIntelliSenseReader {
	readonly readCompletions: (factoryName: FieldFactoryName) => readonly string[]
	readonly readFactoryDocumentation: (
		factoryName: FieldFactoryName,
	) => IntelliSenseDocumentation
	readonly readOptionDocumentation: (
		factoryName: FieldFactoryName,
		optionName: string,
	) => IntelliSenseDocumentation
}

const commonFieldOptions = [
	'default',
	'description',
	'immutable',
	'indexed',
	'list',
	'required',
	'validation',
] as const

const fieldSpecificOptions: FactoryOptionMap = {
	bigintField: ['autoIncrement'],
	binaryField: [],
	booleanField: [],
	dateField: ['autoNow'],
	dateTimeField: ['autoNow', 'timezone'],
	decimalField: ['precision', 'scale'],
	enumField: ['typeName', 'values'],
	floatField: [],
	intField: ['autoIncrement'],
	jsonField: [],
	objectField: ['fields', 'typeName'],
	stringField: [],
	timeField: ['autoNow', 'timezone'],
	uuidField: [],
}

const commonValidationOptions = [] as const
const validationSpecificOptions: FactoryOptionMap = {
	bigintField: ['range'],
	binaryField: ['length'],
	booleanField: [],
	dateField: ['range'],
	dateTimeField: ['range'],
	decimalField: ['range'],
	enumField: [],
	floatField: ['finite', 'range'],
	intField: ['range'],
	jsonField: [],
	objectField: [],
	stringField: ['length', 'match'],
	timeField: ['range'],
	uuidField: ['version'],
}

/** Reuses one complete factory matrix for each IntelliSense nesting level. */
const createCompletionCases = (
	commonOptions: readonly string[],
	specificOptions: FactoryOptionMap,
	createInvocation: (factoryName: FieldFactoryName) => FieldInvocation,
): readonly FieldCompletionCase[] =>
	fieldFactoryNames.map((factoryName) => {
		const invocation = createInvocation(factoryName)

		return {
			factoryName,
			invocationPrefix: invocation.prefix,
			...(invocation.suffix === undefined
				? {}
				: { invocationSuffix: invocation.suffix }),
			options: [...commonOptions, ...specificOptions[factoryName]],
		}
	})

const fieldCompletionCases = createCompletionCases(
	commonFieldOptions,
	fieldSpecificOptions,
	() => ({ prefix: '' }),
)
const validationCompletionCases = createCompletionCases(
	commonValidationOptions,
	validationSpecificOptions,
	(factoryName) => ({
		prefix: `${
			factoryName === 'enumField'
				? "values: ['draft'], "
				: factoryName === 'objectField'
					? 'fields: {}, '
					: ''
		}validation: { `,
		suffix: ' }',
	}),
)

const boundaryCompletionCases: readonly FieldCompletionCase[] = [
	{
		factoryName: 'dateTimeField',
		invocationPrefix: 'validation: { range: { ',
		invocationSuffix: ' } }',
		options: ['max', 'min'],
	},
	{
		factoryName: 'decimalField',
		invocationPrefix: 'validation: { range: { ',
		invocationSuffix: ' } }',
		options: ['max', 'min'],
	},
	{
		factoryName: 'intField',
		invocationPrefix: 'validation: { range: { ',
		invocationSuffix: ' } }',
		options: ['max', 'min'],
	},
	{
		factoryName: 'stringField',
		invocationPrefix: 'validation: { length: { ',
		invocationSuffix: ' } }',
		options: ['max', 'min'],
	},
]

const fieldDefaultExpressions: Readonly<Record<FieldFactoryName, string>> = {
	bigintField: '1n',
	binaryField: 'new Uint8Array()',
	booleanField: 'true',
	dateField: "'2026-08-01'",
	dateTimeField: "'2026-08-01T10:00:00.000Z'",
	decimalField: "'12.50'",
	enumField: "'draft'",
	floatField: '1.5',
	intField: '1',
	jsonField: '{}',
	objectField: "{ name: 'Ada' }",
	stringField: "'Ada'",
	timeField: "'10:00:00'",
	uuidField: "'018f3f35-a4b2-7cc1-9dd5-3f706ef18a34'",
}

const topLevelOptionExpressions: Readonly<Record<string, string>> = {
	autoIncrement: 'true',
	autoNow: 'true',
	description: "'Developer-facing description'",
	fields: '{ name: stringField() }',
	hooks: '{}',
	immutable: 'true',
	indexed: "'unique'",
	list: 'true',
	precision: '12',
	required: 'true',
	scale: '2',
	timezone: 'false',
	typeName: "'ExampleType'",
	validation: '{}',
	values: "['draft'] as const",
}

const validationOptionExpressions: Readonly<Record<string, string>> = {
	finite: 'true',
	length: '{}',
	match: '/^[a-z]+$/u',
	precision: '12',
	range: '{}',
	scale: '2',
	version: '7',
}

const boundaryOptionExpressions: Readonly<Record<string, string>> = {
	max: '1',
	min: '0',
}

/** Supplies mandatory options without obscuring the property under inspection. */
const createRequiredOptions = (
	factoryName: FieldFactoryName,
	optionName: string,
	invocationPrefix: string,
): string => {
	if (
		factoryName === 'enumField' &&
		optionName !== 'values' &&
		!invocationPrefix.includes('values:')
	) {
		return "values: ['draft'] as const, "
	}

	if (
		factoryName === 'objectField' &&
		optionName !== 'fields' &&
		!invocationPrefix.includes('fields:')
	) {
		return 'fields: { name: stringField() }, '
	}

	return ''
}

/** Expands completion contracts into inserted-property hover fixtures. */
const createHoverCases = (
	cases: readonly FieldCompletionCase[],
	expressions: Readonly<Record<string, string>>,
): readonly FieldOptionHoverCase[] =>
	cases.flatMap(
		({ factoryName, invocationPrefix, invocationSuffix = '', options }) =>
			options.map((optionName) => {
				const expression =
					optionName === 'default'
						? fieldDefaultExpressions[factoryName]
						: expressions[optionName]

				if (expression === undefined) {
					throw new TypeError(`Missing hover expression for ${optionName}`)
				}

				return {
					factoryName,
					optionName,
					source: `${factoryName}({ ${createRequiredOptions(factoryName, optionName, invocationPrefix)}${invocationPrefix}/* hover */${optionName}: ${expression}${invocationSuffix} })`,
				}
			}),
	)

const fieldHoverCases = createHoverCases(
	fieldCompletionCases,
	topLevelOptionExpressions,
)
const validationHoverCases = createHoverCases(
	validationCompletionCases,
	validationOptionExpressions,
)
const boundaryHoverCases = createHoverCases(
	boundaryCompletionCases,
	boundaryOptionExpressions,
)

/** Exercises every built-in factory with metadata that must stay runtime-only. */
const compactFieldSignatureCases: readonly CompactFieldSignatureCase[] = [
	{
		factoryName: 'bigintField',
		expression:
			"bigintField({ autoIncrement: true, required: true, validation: { range: { min: 1n } }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'NonDefaultedBigintField<true, false, false, true>',
	},
	{
		factoryName: 'binaryField',
		expression:
			"binaryField({ default: new Uint8Array([1]), required: true, validation: { length: { max: 8 } }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedBinaryField<true, false, false>',
	},
	{
		factoryName: 'booleanField',
		expression:
			"booleanField({ default: true, required: true, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedBooleanField<true, false, false>',
	},
	{
		factoryName: 'dateField',
		expression:
			"dateField({ autoNow: true, required: true, validation: { range: { min: '2026-01-01' } }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'NonDefaultedDateField<true, false, false, true>',
	},
	{
		factoryName: 'dateTimeField',
		expression:
			"dateTimeField({ autoNow: true, timezone: true, required: true, validation: { range: { min: '2026-01-01T00:00:00.000Z' } }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'NonDefaultedDateTimeField<true, false, false, true>',
	},
	{
		factoryName: 'decimalField',
		expression:
			"decimalField({ default: '19.99', required: true, precision: 12, scale: 2, validation: { range: { min: '-9999999999.99' } }, indexed: true, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedDecimalField<true, false, false>',
	},
	{
		factoryName: 'enumField',
		expression:
			"enumField({ values: ['draft', 'published'] as const, default: 'draft', required: true, typeName: 'StatusHoverMarker', description: 'runtime-only-hover-marker' })",
		expectedReturn:
			'DefaultedEnumField<readonly ["draft", "published"], true, false, false>',
	},
	{
		factoryName: 'floatField',
		expression:
			"floatField({ default: 1.5, required: true, validation: { finite: true, range: { min: 0 } }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedFloatField<true, false, false>',
	},
	{
		factoryName: 'intField',
		expression:
			"intField({ autoIncrement: true, required: true, validation: { range: { min: 1 } }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'NonDefaultedIntField<true, false, false, true>',
	},
	{
		factoryName: 'jsonField',
		expression:
			"jsonField({ default: { active: true }, required: true, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedJsonField<true, false, false>',
	},
	{
		factoryName: 'objectField',
		imports: ['stringField'],
		expression:
			"objectField({ fields: { name: stringField() }, default: { name: 'Ada' }, required: true, typeName: 'ProfileHoverMarker', description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedObjectField<',
	},
	{
		factoryName: 'stringField',
		expression:
			"stringField({ default: 'Ada', required: true, validation: { length: { min: 2 }, match: /^[a-z]+$/u }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedStringField<true, false, false>',
	},
	{
		factoryName: 'timeField',
		expression:
			"timeField({ autoNow: true, timezone: true, required: true, validation: { range: { min: '08:00:00.000Z' } }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'NonDefaultedTimeField<true, false, false, true>',
	},
	{
		factoryName: 'uuidField',
		expression:
			"uuidField({ default: '018f3f35-a4b2-7cc1-9dd5-3f706ef18a34', required: true, validation: { version: 7 }, description: 'runtime-only-hover-marker' })",
		expectedReturn: 'DefaultedUuidField<true, false, false>',
	},
]

/** Reads the editor signature at one marker without persisting a fixture file. */
const readMarkedQuickInfoDisplay = (
	fileName: string,
	sourceWithMarker: string,
	marker: string,
): string => {
	const markerPosition = sourceWithMarker.indexOf(marker)

	if (markerPosition < 0) {
		throw new TypeError(`Missing QuickInfo marker: ${marker}`)
	}

	const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
	const service = createLanguageService(fileName, source)
	const quickInfo = service.getQuickInfoAtPosition(
		fileName,
		markerPosition + marker.length,
	)

	if (quickInfo === undefined) {
		throw new TypeError('Expected marked QuickInfo')
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

/** Creates the same contextual completion requests used by TypeScript editors. */
const createFieldOptionCompletionReader = (
	cases: readonly FieldCompletionCase[],
): FieldIntelliSenseReader => {
	const fileName = `${import.meta.dirname}/field-autocomplete.fixture.ts`
	const factoryNames = cases.map(({ factoryName }) => factoryName).join(', ')
	const markers = new Map<FieldFactoryName, string>()
	const calls = cases.map(
		({ factoryName, invocationPrefix, invocationSuffix = '' }) => {
			const marker = `/* completion:${factoryName} */`

			markers.set(factoryName, marker)

			return `${factoryName}({ ${invocationPrefix}${marker}${invocationSuffix} })`
		},
	)
	let source = `
import { ${factoryNames} } from '../../src/schema/index.js'

${calls.join('\n')}
`
	const positions = new Map<FieldFactoryName, number>()

	for (const [factoryName, marker] of markers) {
		const position = source.indexOf(marker)

		if (position < 0) {
			throw new TypeError(`Missing completion marker for ${factoryName}`)
		}

		positions.set(factoryName, position)
		source = source.replace(marker, ' '.repeat(marker.length))
	}

	const service = createLanguageService(fileName, source)
	const readPosition = (factoryName: FieldFactoryName): number => {
		const position = positions.get(factoryName)

		if (position === undefined) {
			throw new TypeError(`Unknown field factory: ${factoryName}`)
		}

		return position
	}
	const readCompletionEntries = (
		factoryName: FieldFactoryName,
	): readonly ts.CompletionEntry[] => {
		const position = readPosition(factoryName)
		const completions = service.getCompletionsAtPosition(fileName, position, {
			includeCompletionsWithInsertText: true,
		})

		if (completions === undefined) {
			throw new TypeError(
				`Expected field option completions for ${factoryName}`,
			)
		}

		return completions.entries.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)
	}
	const readDocumentation = (
		documentation: readonly ts.SymbolDisplayPart[] | undefined,
		tags: readonly ts.JSDocTagInfo[] | undefined,
	): IntelliSenseDocumentation => ({
		documentation: documentation?.map(({ text }) => text).join('') ?? '',
		hasExample: tags?.some(({ name }) => name === 'example') ?? false,
	})

	return {
		readCompletions: (factoryName) =>
			readCompletionEntries(factoryName)
				.map((entry) => entry.name)
				.sort(),
		readFactoryDocumentation: (factoryName) => {
			const position = source.indexOf(`${factoryName}({`)
			const quickInfo = service.getQuickInfoAtPosition(fileName, position)

			if (quickInfo === undefined) {
				throw new TypeError(`Expected quick info for ${factoryName}`)
			}

			return readDocumentation(quickInfo.documentation, quickInfo.tags)
		},
		readOptionDocumentation: (factoryName, optionName) => {
			const position = readPosition(factoryName)
			const entry = readCompletionEntries(factoryName).find(
				(candidate) => candidate.name === optionName,
			)

			if (entry === undefined) {
				throw new TypeError(`Unknown ${factoryName} option: ${optionName}`)
			}

			const details = service.getCompletionEntryDetails(
				fileName,
				position,
				optionName,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)

			if (details === undefined) {
				throw new TypeError(
					`Expected completion details for ${factoryName}.${optionName}`,
				)
			}

			return readDocumentation(details.documentation, details.tags)
		},
	}
}

/** Reuses one TypeScript service for every inserted-property QuickInfo request. */
const createFieldOptionHoverReader = (
	cases: readonly FieldOptionHoverCase[],
): ((hoverCase: FieldOptionHoverCase) => IntelliSenseDocumentation) => {
	const fileName = `${import.meta.dirname}/field-hover.fixture.ts`
	const positions = new Map<FieldOptionHoverCase, number>()
	const markers = new Map<FieldOptionHoverCase, string>()
	const calls = cases.map((hoverCase, index) => {
		const marker = `/* hover:${String(index)} */`

		markers.set(hoverCase, marker)
		return hoverCase.source.replace('/* hover */', marker)
	})
	let source = `
import { ${fieldFactoryNames.join(', ')} } from '../../src/schema/index.js'

${calls.join('\n')}
`

	for (const [hoverCase, marker] of markers) {
		const markerPosition = source.indexOf(marker)

		if (markerPosition < 0) {
			throw new TypeError(
				`Missing hover marker for ${hoverCase.factoryName}.${hoverCase.optionName}`,
			)
		}

		positions.set(hoverCase, markerPosition + marker.length)
		source = source.replace(marker, ' '.repeat(marker.length))
	}

	const service = createLanguageService(fileName, source)

	return (hoverCase) => {
		const position = positions.get(hoverCase)

		if (position === undefined) {
			throw new TypeError(
				`Unknown hover case: ${hoverCase.factoryName}.${hoverCase.optionName}`,
			)
		}

		const quickInfo = service.getQuickInfoAtPosition(fileName, position)

		if (quickInfo === undefined) {
			throw new TypeError(
				`Expected hover information for ${hoverCase.factoryName}.${hoverCase.optionName}`,
			)
		}

		return {
			documentation:
				quickInfo.documentation?.map(({ text }) => text).join('') ?? '',
			hasExample:
				quickInfo.tags?.some(({ name }) => name === 'example') ?? false,
		}
	}
}

/** Protects the documentation payload displayed by editor completion popups. */
const expectDocumented = (value: IntelliSenseDocumentation): void => {
	expect(value.documentation.trim()).not.toHaveLength(0)
	expect(value.hasExample).toBe(true)
}

/** Adds the inspected option path to hover failures for actionable diagnostics. */
const expectHoverDocumented = (
	value: IntelliSenseDocumentation,
	label: string,
): void => {
	expect(value.documentation.trim(), label).not.toHaveLength(0)
	expect(value.hasExample, label).toBe(true)
}

describe('field factory IntelliSense', () => {
	const reader = createFieldOptionCompletionReader(fieldCompletionCases)

	it.each(fieldCompletionCases)(
		'suggests every $factoryName option',
		({ factoryName, options }) => {
			expect(reader.readCompletions(factoryName)).toStrictEqual(
				[...options].sort(),
			)
		},
	)

	it.each(fieldCompletionCases)(
		'documents $factoryName and every suggested option',
		({ factoryName, options }) => {
			expectDocumented(reader.readFactoryDocumentation(factoryName))

			for (const optionName of options) {
				expectDocumented(
					reader.readOptionDocumentation(factoryName, optionName),
				)
			}
		},
	)

	it.each(compactFieldSignatureCases)(
		'keeps the $factoryName signature compact without leaking runtime literals',
		({ factoryName, imports = [], expression, expectedReturn }) => {
			const marker = '/* hover */'
			const importedFactories = [factoryName, ...imports].join(', ')
			const display = readMarkedQuickInfoDisplay(
				`${import.meta.dirname}/${factoryName}-hover.fixture.ts`,
				`
import { ${importedFactories} } from '../../src/schema/index.js'

const field = ${marker}${expression}
`,
				marker,
			)

			expect(display).toContain(expectedReturn)
			expect(display).not.toContain('DefaultedCompactScalarFieldOptions<')
			expect(display).not.toContain('NonDefaultedCompactScalarFieldOptions<')
			expect(display).not.toContain('ScalarFieldTypegenState<')
			expect(display).toContain('(+1 overload)')
			expect(display).not.toContain('(+2 overloads)')
			expect(display).not.toContain('runtime-only-hover-marker')
			expect(display).not.toContain('StatusHoverMarker')
			expect(display).not.toContain('ProfileHoverMarker')
			expect(display).not.toContain('readonly []')
			expect(display).not.toContain('readonly validation?:')
			expect(display).not.toContain('readonly default:')
			expect(display).not.toContain('FieldHooks')
			expect(display).not.toContain('FieldAccess')
			expect(display).not.toContain('resolveInput')
			expect(display).not.toContain('HOOK_BODY_MUST_NOT_LEAK')
			expect(display).not.toContain('ACCESS_BODY_MUST_NOT_LEAK')
		},
	)
})

describe('field validation IntelliSense', () => {
	const reader = createFieldOptionCompletionReader(validationCompletionCases)

	it.each(validationCompletionCases)(
		'suggests and documents every $factoryName validation option',
		({ factoryName, options }) => {
			expect(reader.readCompletions(factoryName)).toStrictEqual(
				[...options].sort(),
			)

			for (const optionName of options) {
				expectDocumented(
					reader.readOptionDocumentation(factoryName, optionName),
				)
			}
		},
	)
})

describe('field validation boundary IntelliSense', () => {
	const reader = createFieldOptionCompletionReader(boundaryCompletionCases)

	it.each(boundaryCompletionCases)(
		'suggests and documents every $factoryName boundary option',
		({ factoryName, options }) => {
			expect(reader.readCompletions(factoryName)).toStrictEqual(
				[...options].sort(),
			)

			for (const optionName of options) {
				expectDocumented(
					reader.readOptionDocumentation(factoryName, optionName),
				)
			}
		},
	)
})

describe('inserted field option hover information', () => {
	const hoverCases = [
		...fieldHoverCases,
		...validationHoverCases,
		...boundaryHoverCases,
	]
	const readHoverDocumentation = createFieldOptionHoverReader(hoverCases)

	it.each(hoverCases)(
		'documents $factoryName / $optionName after insertion',
		(hoverCase: FieldOptionHoverCase) => {
			expectHoverDocumented(
				readHoverDocumentation(hoverCase),
				`${hoverCase.factoryName}.${hoverCase.optionName}`,
			)
		},
	)
})
