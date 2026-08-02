import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/hooks/plugin-hook-targets.fixture.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-plugin-hook-targets.packed.fixture.ts',
)
const sourceFixture = await readFile(sourceFixtureFile, 'utf8')
const packedFixture = sourceFixture.replaceAll(
	"'../../src/index.js'",
	"'@ultimabase/core'",
)
const markerPattern = /\/\* (completion|hover):[a-z-]+ \*\//gu
const positions = new Map<string, number>()

for (const match of packedFixture.matchAll(markerPattern)) {
	positions.set(match[0], match.index)
}

const source = packedFixture.replace(markerPattern, (marker) =>
	' '.repeat(marker.length),
)
const service = createLanguageService(packedFixtureFile, source)

/** Resolves one stable marker shared with the source declaration fixture. */
const readMarkerPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Missing packed plugin hook target marker: ${marker}`)
	}

	return position
}

/** Reads the concise editor display following one removed hover marker. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(source[position] ?? '')) {
		position += 1
	}

	const quickInfo = service.getQuickInfoAtPosition(packedFixtureFile, position)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing packed plugin hook target hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

/** Reads contextual completion entries at one declaration marker. */
const readCompletions = (name: string): readonly ts.CompletionEntry[] => {
	const position = readMarkerPosition(`/* completion:${name} */`)
	const completions = service.getCompletionsAtPosition(
		packedFixtureFile,
		position,
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing packed plugin hook completions: ${name}`)
	}

	return completions.entries
}

/** Reads literal path suggestions from the empty string following one marker. */
const readStringCompletions = (name: string): readonly ts.CompletionEntry[] => {
	const marker = `/* completion:${name} */`
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(source[position] ?? '')) {
		position += 1
	}

	const completions = service.getCompletionsAtPosition(
		packedFixtureFile,
		position + 1,
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing packed plugin hook path completions: ${name}`)
	}

	return completions.entries
}

describe('packed @ultimabase/core plugin hook targets', () => {
	it('type-checks through public package declarations', () => {
		expect(service.getSemanticDiagnostics(packedFixtureFile)).toStrictEqual([])
	})

	it('preserves every target method and exact field-path completion', () => {
		expect(
			readCompletions('hook-target-methods')
				.map(({ name }) => name)
				.sort(),
		).toStrictEqual([
			'field',
			'fieldExtension',
			'fieldKind',
			'global',
			'schema',
			'schemaExtension',
		])

		const rootNames = readStringCompletions('root-field-path').map(
			({ name }) => name,
		)
		const nestedNames = readStringCompletions('nested-field-path').map(
			({ name }) => name,
		)

		expect(rootNames).toEqual(
			expect.arrayContaining(['endpoint', 'id', 'profile', 'tags', 'title']),
		)
		expect(nestedNames).toContain('displayName')
		expect(nestedNames).not.toContain('title')
	})

	it('keeps exact values and concise public aliases after declaration emission', () => {
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

		const registry = readHoverDisplay('hook-registry')
		const kindTarget = readHoverDisplay('kind-target')

		expect(registry).toContain('PluginHookRegistry')
		expect(registry).not.toContain('SchemaDefinition<')
		expect(kindTarget).toContain('FieldKindHookTarget<')
		expect(kindTarget).not.toContain('FieldHooks<')
	})
})
