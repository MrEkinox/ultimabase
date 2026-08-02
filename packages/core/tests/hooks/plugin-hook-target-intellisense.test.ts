import { readFile } from 'node:fs/promises'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = `${import.meta.dirname}/plugin-hook-targets.fixture.ts`
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

/** Resolves stable fixture markers without coupling assertions to source lines. */
const readMarkerPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Missing plugin hook target marker: ${marker}`)
	}

	return position
}

/** Reads the concise type display shown by an editor hover. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(source[position] ?? '')) {
		position += 1
	}

	const quickInfo = service.getQuickInfoAtPosition(fixtureFile, position)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing plugin hook target hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

/** Reads all contextual completion entries at one target marker. */
const readCompletions = (name: string) => {
	const position = readMarkerPosition(`/* completion:${name} */`)
	const completions = service.getCompletionsAtPosition(fixtureFile, position, {
		includeCompletionsWithInsertText: true,
	})

	if (completions === undefined) {
		throw new TypeError(`Missing plugin hook target completions: ${name}`)
	}

	return { entries: completions.entries, position }
}

/** Reads literal suggestions from the string token following one marker. */
const readStringCompletions = (name: string) => {
	const marker = `/* completion:${name} */`
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(source[position] ?? '')) {
		position += 1
	}

	const completions = service.getCompletionsAtPosition(
		fixtureFile,
		position + 1,
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing plugin hook path completions: ${name}`)
	}

	return completions.entries
}

describe('plugin hook target IntelliSense', () => {
	it('has no semantic diagnostics', () => {
		expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
	})

	it('suggests setup context and every typed target method', () => {
		const setupNames = readCompletions('setup-context').entries.map(
			({ name }) => name,
		)
		const methods = readCompletions('hook-target-methods')

		expect(setupNames).toEqual(
			expect.arrayContaining(['hooks', 'registries', 'schemas', 'services']),
		)
		expect(methods.entries.map(({ name }) => name).sort()).toStrictEqual([
			'field',
			'fieldExtension',
			'fieldKind',
			'global',
			'schema',
			'schemaExtension',
		])

		for (const method of methods.entries) {
			const details = service.getCompletionEntryDetails(
				fixtureFile,
				methods.position,
				method.name,
				undefined,
				method.source,
				undefined,
				method.data,
			)

			expect(ts.displayPartsToString(details?.documentation).trim()).not.toBe(
				'',
			)
		}
	})

	it('suggests exact root and nested field path segments', () => {
		const rootNames = readStringCompletions('root-field-path').map(
			({ name }) => name,
		)
		const nestedNames = readStringCompletions('nested-field-path').map(
			({ name }) => name,
		)

		expect(rootNames).toEqual(
			expect.arrayContaining([
				'createdAt',
				'endpoint',
				'id',
				'profile',
				'tags',
				'title',
				'updatedAt',
			]),
		)
		expect(nestedNames).toContain('displayName')
		expect(nestedNames).not.toContain('title')
	})

	it('keeps exact schema, field, extension, and custom-kind inference', () => {
		expect(readHoverDisplay('schema-title')).toContain('string')
		expect(readHoverDisplay('listed-value')).toContain(
			'readonly string[] | null',
		)
		expect(readHoverDisplay('object-value')).toContain(
			'displayName?: string | null;',
		)
		expect(readHoverDisplay('custom-value')).toContain('URL')
		expect(readHoverDisplay('kind-value')).toContain('URL')
		expect(readHoverDisplay('schema-extension-config')).toContain('"strict"')
		expect(readHoverDisplay('field-extension-config')).toContain('true')
	})

	it('keeps registry and kind-token hovers behind public aliases', () => {
		expect(readHoverDisplay('hook-registry')).toContain('PluginHookRegistry')
		const target = readHoverDisplay('kind-target')

		expect(target).toContain('FieldKindHookTarget<')
		expect(target).not.toContain('FieldHooks<')
		expect(target).not.toContain('resolveInput')
	})
})
