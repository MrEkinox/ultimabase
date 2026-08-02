import { readFile } from 'node:fs/promises'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fixtureFile = `${import.meta.dirname}/native-field-hooks.fixture.ts`
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

const fieldHookPhaseNames = [
	'afterCommit',
	'afterCreate',
	'afterDelete',
	'afterRollback',
	'afterSave',
	'afterUpdate',
	'afterUpsert',
	'beforeCreate',
	'beforeDelete',
	'beforeSave',
	'beforeUpdate',
	'beforeUpsert',
	'onChange',
	'onError',
	'resolveInput',
	'resolveOutput',
	'validate',
] as const

/** Resolves stable IntelliSense markers without coupling assertions to lines. */
const readMarkerPosition = (marker: string): number => {
	const position = positions.get(marker)

	if (position === undefined) {
		throw new TypeError(`Missing native field hook marker: ${marker}`)
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
		throw new TypeError(`Missing native field hook hover: ${name}`)
	}

	return ts.displayPartsToString(quickInfo.displayParts)
}

/** Reads contextual member completions at one declaration marker. */
const readCompletions = (name: string) => {
	const position = readMarkerPosition(`/* completion:${name} */`)
	const completions = service.getCompletionsAtPosition(fixtureFile, position, {
		includeCompletionsWithInsertText: true,
	})

	if (completions === undefined) {
		throw new TypeError(`Missing native field hook completions: ${name}`)
	}

	return {
		entries: completions.entries.filter(
			(entry) => entry.kind === ts.ScriptElementKind.memberVariableElement,
		),
		position,
	}
}

describe('native field hook IntelliSense', () => {
	it('has no semantic diagnostics', () => {
		expect(service.getSemanticDiagnostics(fixtureFile)).toStrictEqual([])
	})

	it('suggests and documents every inline phase', () => {
		const { entries, position } = readCompletions('field-hooks')
		const phases = entries.sort((left, right) =>
			left.name.localeCompare(right.name),
		)

		expect(phases.map(({ name }) => name)).toStrictEqual([
			...fieldHookPhaseNames,
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
				throw new TypeError(`Missing field hook details: ${phase.name}`)
			}

			expect(ts.displayPartsToString(details.documentation).trim()).not.toBe('')
		}
	})

	it('suggests only the relevant handler input members', () => {
		expect(
			readCompletions('resolve-input')
				.entries.map(({ name }) => name)
				.sort(),
		).toStrictEqual(['kind', 'mode', 'value'])
		expect(
			readCompletions('on-change')
				.entries.map(({ name }) => name)
				.sort(),
		).toStrictEqual(['change', 'kind', 'timing'])
	})

	it('shows exact values and explicit change state', () => {
		expect(readHoverDisplay('input-value')).toContain('string | null')
		expect(readHoverDisplay('change-timing')).toContain('"before-commit"')
		const currentState = readHoverDisplay('current-state')

		expect(currentState).toContain('present: false;')
		expect(currentState).toContain('present: true;')
		expect(currentState).toContain('value: string | null;')
		expect(currentState).not.toContain('value: string | null | undefined;')
	})

	it('keeps declaration callbacks out of compact field hovers', () => {
		const display = readHoverDisplay('field-definition')

		expect(display).toContain(
			'NonDefaultedStringField<false, true, false, false>',
		)
		expect(display).not.toContain('FieldHooks')
		expect(display).not.toContain('resolveInput')
		expect(display).not.toContain('HOOK_BODY_MUST_NOT_LEAK')
	})
})
