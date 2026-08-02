import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/hooks/native-field-hooks.fixture.ts',
)
const packedFixtureFile = path.join(
	repositoryRoot,
	'tests/e2e/core-native-field-hooks.packed.fixture.ts',
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
		throw new TypeError(`Missing packed field hook marker: ${marker}`)
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
		throw new TypeError(`Missing packed field hook hover: ${name}`)
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
		throw new TypeError(`Missing packed field completions: ${name}`)
	}

	return completions.entries
		.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)
		.map(({ name: entryName }) => entryName)
		.sort()
}

describe('packed @ultimabase/core native field hooks', () => {
	it('type-checks through public package declarations', () => {
		expect(service.getSemanticDiagnostics(packedFixtureFile)).toStrictEqual([])
	})

	it('preserves documented inline phase completion', () => {
		const position = readMarkerPosition('/* completion:field-hooks */')
		const completions = service.getCompletionsAtPosition(
			packedFixtureFile,
			position,
			{ includeCompletionsWithInsertText: true },
		)
		const resolveInput = completions?.entries.find(
			({ name }) => name === 'resolveInput',
		)

		if (resolveInput === undefined) {
			throw new TypeError('Missing packed resolveInput completion')
		}

		const details = service.getCompletionEntryDetails(
			packedFixtureFile,
			position,
			resolveInput.name,
			undefined,
			resolveInput.source,
			undefined,
			resolveInput.data,
		)

		expect(ts.displayPartsToString(details?.documentation).trim()).not.toBe('')
		expect(details?.tags?.some(({ name }) => name === 'example')).toBe(true)
	})

	it('keeps exact values and compact field hovers after declaration emission', () => {
		expect(readHoverDisplay('input-value')).toContain('string | null')
		expect(readHoverDisplay('change-timing')).toContain('"before-commit"')
		const fieldDisplay = readHoverDisplay('field-definition')

		expect(fieldDisplay).toContain(
			'NonDefaultedStringField<false, true, false, false>',
		)
		expect(fieldDisplay).not.toContain('FieldHooks')
		expect(fieldDisplay).not.toContain('HOOK_BODY_MUST_NOT_LEAK')
	})

	it('preserves field family composition and concise aliases after emission', () => {
		expect(readMemberCompletionNames('field-save-families')).toStrictEqual([
			'all',
			'create',
			'update',
			'upsert',
		])
		expect(readHoverDisplay('field-create-family-kind')).toContain(
			'FieldCreateHookKind',
		)
		const display = readHoverDisplay('field-family-declaration')

		expect(display).toContain('FieldBeforeSaveHookDeclaration<')
		expect(display).not.toContain('FieldValueHookInput<')
		expect(display).not.toContain('HookHandlerDeclaration<')
	})
})
