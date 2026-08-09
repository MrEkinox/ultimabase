import { readFile } from 'node:fs/promises'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = `${import.meta.dirname}/native-schema-hooks.fixture.ts`
const fixtureSource = await readFile(fixtureFile, 'utf8')
const markerPattern = /\/\* (completion|hover):[a-z-]+ \*\//gu
const positions = new Map<string, number>()

for (const match of fixtureSource.matchAll(markerPattern)) {
	positions.set(match[0], match.index)
}

const source = fixtureSource.replace(markerPattern, (marker) =>
	' '.repeat(marker.length),
)
const service = createLanguageService(fixtureFile, source)

/** Resolves stable IntelliSense markers without coupling assertions to lines. */
const readMarkerPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Missing native schema hook marker: ${marker}`)
	}

	return position
}

/** Moves from a removed marker to the first following source token. */
const readTokenPosition = (marker: string): number => {
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(source[position] ?? '')) {
		position += 1
	}

	return position
}

/** Reads the concise type display shown by an editor hover. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	const quickInfo = service.getQuickInfoAtPosition(
		fixtureFile,
		readTokenPosition(marker),
	)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing native schema hook hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

/** Reads contextual property completions at one declaration marker. */
const readCompletions = (name: string) => {
	const position = readMarkerPosition(`/* completion:${name} */`)
	const completions = service.getCompletionsAtPosition(fixtureFile, position, {
		includeCompletionsWithInsertText: true,
	})

	if (completions === undefined) {
		throw new TypeError(`Missing native schema hook completions: ${name}`)
	}

	return { entries: completions.entries, position }
}

/** Keeps family-map assertions focused on contextual object members. */
const readMemberCompletions = (name: string) => {
	const completion = readCompletions(name)

	return {
		entries: completion.entries.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		),
		position: completion.position,
	}
}

const schemaHookPhaseNames = [
	'afterOperation',
	'beforeOperation',
	'resolveInput',
] as const

describe('native schema hook IntelliSense', () => {
	it('has no semantic diagnostics', () => {
		expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
	})

	it('suggests hooks on Schema options', () => {
		const { entries } = readCompletions('schema-options')
		const names = entries
			.filter(
				(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
			)
			.map(({ name }) => name)

		expect(names).toContain('hooks')
	})

	it('suggests and documents every schema hook phase', () => {
		const { entries, position } = readCompletions('schema-hooks')
		const phases = entries
			.filter(
				(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
			)
			.sort((left, right) => left.name.localeCompare(right.name))

		expect(phases.map(({ name }) => name)).toStrictEqual([
			...schemaHookPhaseNames,
		])

		for (const phase of phases) {
			const details = service.getCompletionEntryDetails(
				fixtureFile,
				position,
				phase.name,
				undefined,
				phase.source,
				undefined,
				phase.data,
			)

			if (details === undefined) {
				throw new TypeError(`Missing schema hook details: ${phase.name}`)
			}

			expect(ts.displayPartsToString(details.documentation).trim()).not.toBe('')
			expect(details.tags?.some(({ name }) => name === 'example')).toBe(true)
		}
	})

	it('uses exact inputs and safe BaseItem values without generated metadata', () => {
		const createInput = readHoverDisplay('create-input')

		expect(createInput).toContain('title: string;')
		expect(createInput).toContain('views?: number | null;')
		expect(createInput).not.toContain('SchemaDefinition<')
		expect(createInput).not.toContain('OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK')
		expect(readHoverDisplay('update-expression')).toContain('UpdateExpression<')
		expect(readHoverDisplay('create-item')).toContain(
			'readonly [x: string]: unknown;',
		)
		expect(readHoverDisplay('create-item')).toContain('toString(): string;')
		expect(readHoverDisplay('create-item-update')).toContain('update')
	})

	it('suggests and documents only compatible family branches', () => {
		const operation = readMemberCompletions('schema-operation-families')
		const save = readMemberCompletions('schema-save-families')

		expect(operation.entries.map(({ name }) => name).sort()).toStrictEqual([
			'create',
			'delete',
			'update',
		])
		expect(save.entries.map(({ name }) => name).sort()).toStrictEqual([
			'all',
			'create',
			'update',
			'upsert',
		])

		for (const entry of operation.entries) {
			const details = service.getCompletionEntryDetails(
				fixtureFile,
				operation.position,
				entry.name,
				undefined,
				entry.source,
				undefined,
				entry.data,
			)

			if (details === undefined) {
				throw new TypeError(`Missing schema family details: ${entry.name}`)
			}

			expect(ts.displayPartsToString(details.documentation).trim()).not.toBe('')
		}
	})

	it('contextually types list and family callbacks', () => {
		const listInput = readMemberCompletions('schema-list-input')

		expect(listInput.entries.map(({ name }) => name).sort()).toStrictEqual([
			'context',
			'item',
			'kind',
		])
		expect(readHoverDisplay('before-create-kind')).toContain('"create"')
		expect(readHoverDisplay('before-delete-kind')).toContain('"delete"')
		const preparedItem = readHoverDisplay('before-create-item')

		expect(preparedItem).toContain('readonly [x: string]: unknown;')
		expect(preparedItem).toContain('toString(): string;')
		expect(preparedItem).toContain('readonly get:')
		expect(preparedItem).toContain('readonly toJSON:')
		expect(preparedItem).not.toContain('readonly create:')
		expect(preparedItem).not.toContain('readonly update:')
		const originalItem = readHoverDisplay('before-update-original-item')

		expect(originalItem).toContain('readonly [x: string]: unknown;')
		expect(originalItem).toContain('toString(): string;')
		expect(originalItem).toContain('readonly get:')
		expect(readHoverDisplay('create-family-kind')).toContain('"create-one"')
		expect(readHoverDisplay('schema-list-operation')).toContain('OperationAst<')
	})

	it('keeps family declaration hovers behind concise aliases', () => {
		const display = readHoverDisplay('schema-family-declaration')

		expect(display).toContain('SchemaBeforeOperationHooks<')
		expect(display).not.toContain('ExecutableOperationAst<')
		expect(display).not.toContain('InferOperationResult<')
	})
})
