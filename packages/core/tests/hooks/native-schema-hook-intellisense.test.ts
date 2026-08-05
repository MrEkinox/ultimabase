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
	'afterCommit',
	'afterCreate',
	'afterDelete',
	'afterRead',
	'afterRollback',
	'afterUpdate',
	'afterUpsert',
	'beforeCommit',
	'beforeCreate',
	'beforeDelete',
	'beforeRead',
	'beforeUpdate',
	'beforeUpsert',
	'onError',
	'resolveInput',
	'validate',
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

	it('materializes useful callback values without plugin metadata', () => {
		const createInput = readHoverDisplay('create-input')

		expect(createInput).toContain('title: string;')
		expect(createInput).toContain('views?: number | null;')
		expect(createInput).not.toContain('SchemaDefinition<')
		expect(createInput).not.toContain('OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK')
		expect(readHoverDisplay('update-expression')).toContain('UpdateExpression<')
		expect(readHoverDisplay('query')).toContain('Query<')
		expect(readHoverDisplay('count-result')).toContain('number')
		expect(readHoverDisplay('create-result')).toContain(
			'readonly title: string;',
		)
		expect(readHoverDisplay('error')).toContain('unknown')
	})

	it('suggests and documents only compatible family branches', () => {
		const operation = readMemberCompletions('schema-operation-families')
		const save = readMemberCompletions('schema-save-families')

		expect(operation.entries.map(({ name }) => name).sort()).toStrictEqual([
			'all',
			'create',
			'delete',
			'read',
			'update',
			'upsert',
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
			'kind',
			'operation',
		])
		expect(readHoverDisplay('create-family-kind')).toContain(
			'"create-many" | "create-one"',
		)
		expect(readHoverDisplay('schema-list-operation')).toContain('OperationAst<')
	})

	it('keeps family declaration hovers behind concise aliases', () => {
		const display = readHoverDisplay('schema-family-declaration')

		expect(display).toContain('SchemaValidateHookDeclaration<')
		expect(display).not.toContain('ExecutableOperationAst<')
		expect(display).not.toContain('InferOperationResult<')
	})
})
