import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/native-access-contract.prototype.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-native-access-contract.packed.fixture.ts',
)
const sourceFixture = await readFile(sourceFixtureFile, 'utf8')
const packedFixture = sourceFixture.replaceAll(
	"'../../src/index.js'",
	"'@ultimabase/core'",
)
const markerPattern = /\/\* hover:[a-z-]+ \*\//gu
const markerPositions = new Map<string, number>()

for (const match of packedFixture.matchAll(markerPattern)) {
	markerPositions.set(match[0], match.index)
}

const packedSource = packedFixture.replace(markerPattern, (marker) =>
	' '.repeat(marker.length),
)
const languageService = createLanguageService(packedFixtureFile, packedSource)

/** Reads exact packed member suggestions without relying on source declarations. */
const readPackedCompletions = (sourceWithMarker: string): readonly string[] => {
	const marker = '/* completion */'
	const position = sourceWithMarker.indexOf(marker)

	if (position < 0) {
		throw new TypeError('Missing packed Access completion marker')
	}

	const fileName = path.join(
		repositoryRoot,
		'tests/e2e/core-native-access-completion.packed.fixture.ts',
	)
	const service = createLanguageService(
		fileName,
		sourceWithMarker.replace(marker, ' '.repeat(marker.length)),
	)
	const completions = service.getCompletionsAtPosition(fileName, position, {
		includeCompletionsWithInsertText: true,
		triggerKind: ts.CompletionTriggerKind.Invoked,
	})

	if (completions === undefined) {
		throw new TypeError('Missing packed Access completions')
	}

	return completions.entries
		.filter(
			(entry) =>
				entry.kind === ts.ScriptElementKind.memberVariableElement ||
				entry.kind === ts.ScriptElementKind.memberFunctionElement,
		)
		.map(({ name }) => name)
		.sort()
}

/** Reads public QuickInfo after one stable packed-consumer marker. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	const markerPosition = markerPositions.get(marker)

	if (markerPosition === undefined) {
		throw new TypeError(`Missing packed Access marker: ${marker}`)
	}

	let position = markerPosition + marker.length

	while (/\s/u.test(packedSource[position] ?? '')) {
		position += 1
	}

	const quickInfo = languageService.getQuickInfoAtPosition(
		packedFixtureFile,
		position,
	)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing packed Access hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

describe('packed @ultimabase/core native Access contract', () => {
	it('type-checks declarations through the public package export', () => {
		expect(
			languageService.getSemanticDiagnostics(packedFixtureFile),
		).toStrictEqual([])
	})

	it('preserves operation, item, context-value, and transition inference', () => {
		const operationInput = readHoverDisplay('operation-access-input')

		expect(operationInput).toContain('SchemaOperationAccessInput')
		expect(operationInput).not.toContain('kind')
		expect(readHoverDisplay('context-value')).toContain('Principal | undefined')
		expect(readHoverDisplay('field-original-value')).toContain('string')
		expect(readHoverDisplay('field-update-value')).toContain('string')
		expect(readHoverDisplay('field-fill-value')).toContain('string')
		expect(readHoverDisplay('field-clear-original-value')).toContain('string')
		const createItem = readHoverDisplay('create-access-item')
		const originalUpdateItem = readHoverDisplay('update-original-access-item')
		const updateItem = readHoverDisplay('update-access-item')

		expect(createItem).toContain('readonly [x: string]: unknown;')
		expect(createItem).toContain('toString(): string;')
		expect(createItem).toContain('readonly get:')
		expect(createItem).not.toContain('readonly update:')
		expect(originalUpdateItem).toContain('readonly [x: string]: unknown;')
		expect(originalUpdateItem).toContain('toString(): string;')
		expect(originalUpdateItem).toContain('readonly get:')
		expect(updateItem).toContain('readonly [key: string]: unknown;')
		expect(updateItem).toContain('toString(): string;')
		expect(updateItem).not.toContain('readonly get:')
		expect(readHoverDisplay('field-value')).toContain('boolean')
		const whereDisplay = readHoverDisplay('access-where')

		expect(whereDisplay).toContain('WhereBuilder<SchemaClass<"AccessPost"')
		expect(whereDisplay).not.toContain('Query<')
	})

	it('offers the complete field Access hierarchy through packed exports', () => {
		expect(
			readPackedCompletions(`
import { stringField } from '@ultimabase/core'

stringField({ access: { /* completion */ } })
`),
		).toStrictEqual(['read', 'write'])
		expect(
			readPackedCompletions(`
import { stringField } from '@ultimabase/core'

stringField({ access: { read: { /* completion */ } } })
`),
		).toStrictEqual(['orderBy', 'output', 'where'])
		expect(
			readPackedCompletions(`
import { stringField } from '@ultimabase/core'

stringField({ access: { write: { /* completion */ } } })
`),
		).toStrictEqual(['clear', 'fill', 'replace'])
	})

	it('exposes concise documented Access helpers from the package root', () => {
		expect(readHoverDisplay('allow-all')).toContain('true')
		expect(readHoverDisplay('all-mutations')).toContain('allMutations')
		expect(readHoverDisplay('plugin-access')).toContain('PluginAccessRegistry')
	})

	it('keeps native declarations outside the public Schema shape', () => {
		const display = readHoverDisplay('schema-definition')

		expect(display).toContain('SchemaClass<"AccessPost"')
		expect(display).not.toContain('readonly access')
		expect(display).not.toContain('operation:')
	})
})
