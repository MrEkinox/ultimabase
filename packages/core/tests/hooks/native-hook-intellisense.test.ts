import { readFile } from 'node:fs/promises'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = `${import.meta.dirname}/native-hook-contract.prototype.ts`
const fixtureSource = await readFile(fixtureFile, 'utf8')

/** Replaces every named marker with whitespace while retaining stable offsets. */
const createFixtureService = () => {
	const markerPattern = /\/\* (completion|hover):[a-z-]+ \*\//gu
	const positions = new Map<string, number>()

	for (const match of fixtureSource.matchAll(markerPattern)) {
		positions.set(match[0], match.index)
	}

	const source = fixtureSource.replace(markerPattern, (marker) =>
		' '.repeat(marker.length),
	)

	return {
		positions,
		service: createLanguageService(fixtureFile, source),
		source,
	}
}

const fixture = createFixtureService()

/** Resolves one exact source marker without coupling assertions to line numbers. */
const readMarkerPosition = (marker: string): number => {
	const position = fixture.positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Missing native hook fixture marker: ${marker}`)
	}

	return position
}

/** Reads the concise text shown by editor hover information. */
const readHoverDisplay = (name: string): string => {
	const marker = `/* hover:${name} */`
	let position = readMarkerPosition(marker) + marker.length

	while (/\s/u.test(fixture.source[position] ?? '')) {
		position += 1
	}

	const quickInfo = fixture.service.getQuickInfoAtPosition(
		fixtureFile,
		position,
	)

	if (quickInfo === undefined) {
		throw new TypeError(`Missing native hook hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

/** Reads only contextual object-property suggestions at one marker. */
const readPropertyCompletions = (name: string): readonly string[] => {
	const completions = fixture.service.getCompletionsAtPosition(
		fixtureFile,
		readMarkerPosition(`/* completion:${name} */`),
		{ includeCompletionsWithInsertText: true },
	)

	if (completions === undefined) {
		throw new TypeError(`Missing native hook completions: ${name}`)
	}

	return completions.entries
		.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		)
		.map(({ name: entryName }) => entryName)
		.sort()
}

describe('native hook contract prototype IntelliSense', () => {
	it('has no semantic diagnostics', () => {
		expect(fixture.service.getSemanticDiagnostics(fixtureFile)).toStrictEqual(
			[],
		)
	})

	it('contextually exposes schema and field hook entry points', () => {
		expect(readPropertyCompletions('schema-options')).toContain('hooks')
		expect(readPropertyCompletions('schema-hooks')).toStrictEqual([
			'afterOperation',
			'beforeOperation',
			'resolveInput',
			'transaction',
		])
		expect(readPropertyCompletions('field-options')).toContain('hooks')
	})

	it('materializes exact schema callback values and correlated results', () => {
		const createInput = readHoverDisplay('create-input')

		expect(createInput).toContain('title: string;')
		expect(createInput).not.toContain('OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK')
		expect(readHoverDisplay('update-input')).toContain('title?: string;')
		expect(readHoverDisplay('object')).toContain('readonly id: string;')
		expect(readHoverDisplay('object')).toContain('readonly title: string;')
	})

	it('infers exact scalar, enum, object, list, nullable, and plugin values', () => {
		expect(readHoverDisplay('string-value')).toContain('string')
		expect(readHoverDisplay('enum-value')).toContain('"draft" | "published"')
		expect(readHoverDisplay('object-value')).toContain(
			'readonly displayName: string;',
		)
		expect(readHoverDisplay('list-value')).toContain(
			'readonly (readonly string[])[]',
		)
		expect(readHoverDisplay('nullable-value')).toContain('string | null')
		expect(readHoverDisplay('custom-value')).toContain('VectorValue')
	})

	it('keeps callback literals and permission configuration out of field hovers', () => {
		const display = readHoverDisplay('field-definition')

		expect(display).toContain('PrototypeField<')
		expect(display).not.toContain('resolveInput')
		expect(display).not.toContain('OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK')
	})
})
