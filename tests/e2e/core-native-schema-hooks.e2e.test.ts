import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/hooks/native-schema-hooks.fixture.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-native-schema-hooks.packed.fixture.ts',
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

/** Resolves one marker shared by source and packed declaration tests. */
const readMarkerPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Missing packed schema hook marker: ${marker}`)
	}

	return position
}

/** Reads the first token following a removed hover marker. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(source[position] ?? '')) {
		position += 1
	}

	const quickInfo = service.getQuickInfoAtPosition(packedFixtureFile, position)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing packed schema hook hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

/** Reads contextual member names from emitted declaration completions. */
const readMemberCompletionNames = (name: string): string[] => {
	const position = readMarkerPosition(`/* completion:${name} */`)
	const completions = service.getCompletionsAtPosition(
		packedFixtureFile,
		position,
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing packed schema completions: ${name}`)
	}

	return completions.entries
		.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)
		.map(({ name: entryName }) => entryName)
		.sort()
}

describe('packed @ultimabase/core native schema hooks', () => {
	it('type-checks through public package declarations', () => {
		expect(service.getSemanticDiagnostics(packedFixtureFile)).toStrictEqual([])
	})

	it('preserves phase completion documentation', () => {
		const position = readMarkerPosition('/* completion:schema-hooks */')
		const completions = service.getCompletionsAtPosition(
			packedFixtureFile,
			position,
			{ includeCompletionsWithInsertText: true },
		)

		if (completions === undefined) {
			throw new TypeError('Missing packed schema hook completions')
		}

		const beforeRead = completions.entries.find(
			({ name }) => name === 'beforeRead',
		)

		if (beforeRead === undefined) {
			throw new TypeError('Missing packed beforeRead completion')
		}

		const details = service.getCompletionEntryDetails(
			packedFixtureFile,
			position,
			beforeRead.name,
			undefined,
			beforeRead.source,
			undefined,
			beforeRead.data,
		)

		expect(ts.displayPartsToString(details?.documentation).trim()).not.toBe('')
		expect(details?.tags?.some(({ name }) => name === 'example')).toBe(true)
	})

	it('keeps callback values precise and compact after declaration emission', () => {
		const createInput = readHoverDisplay('create-input')

		expect(createInput).toContain('title: string;')
		expect(createInput).not.toContain('SchemaDefinition<')
		expect(createInput).not.toContain('OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK')
		expect(readHoverDisplay('count-result')).toContain('number')
		expect(readHoverDisplay('create-result')).toContain(
			'readonly title: string;',
		)
		expect(readHoverDisplay('error')).toContain('unknown')
	})

	it('preserves family composition and concise aliases after emission', () => {
		expect(readMemberCompletionNames('schema-save-families')).toStrictEqual([
			'all',
			'create',
			'update',
			'upsert',
		])
		expect(readHoverDisplay('create-family-kind')).toContain(
			'"create-many" | "create-one"',
		)
		const display = readHoverDisplay('schema-family-declaration')

		expect(display).toContain('SchemaValidateHookDeclaration<')
		expect(display).not.toContain('ExecutableOperationAst<')
	})
})
