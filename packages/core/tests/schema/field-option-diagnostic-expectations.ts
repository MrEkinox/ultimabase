import * as ts from 'typescript'
import { expect } from 'vitest'

export interface FieldOptionDiagnosticExpectation {
	readonly fragments: readonly string[]
	readonly target: string
}

export interface FieldOptionDiagnosticSnapshot {
	readonly message: string
	readonly target: string | undefined
}

export const fieldOptionDiagnosticExpectations: readonly FieldOptionDiagnosticExpectation[] =
	[
		{
			fragments: ['DefaultedEnumFieldOptions<readonly []', "type 'never'"],
			target: 'values',
		},
		{
			// A mapping is no enum source anymore (ADR-0310).
			fragments: ["Type '{}' is not assignable to type 'EnumValues'"],
			target: 'values',
		},
		{
			fragments: ["Type 'string' is not assignable to type 'never'"],
			target: 'onDelete',
		},
		{
			fragments: ['DefaultedDateFieldOptions', "Type 'true'"],
			target: 'dateField',
		},
		{
			fragments: ['DefaultedTimeFieldOptions', "Type 'true'"],
			target: 'timeField',
		},
		{
			fragments: ['DefaultedDateTimeFieldOptions', "Type 'true'"],
			target: 'dateTimeField',
		},
		{
			fragments: [
				'DefaultedIntFieldOptions',
				"Type 'string'",
				"type 'boolean'",
			],
			target: 'autoIncrement',
		},
		{
			fragments: [
				'DefaultedBigintFieldOptions',
				"Type 'number'",
				"type 'boolean'",
			],
			target: 'autoIncrement',
		},
		{
			fragments: [
				'DefaultedIntFieldOptions',
				'FieldDefault<readonly number[]>',
			],
			target: 'default',
		},
		{
			fragments: [
				'DefaultedBigintFieldOptions',
				'FieldDefault<readonly bigint[]>',
			],
			target: 'default',
		},
		{
			fragments: [
				'DefaultedStringFieldOptions',
				'FieldDefault<readonly string[]>',
			],
			target: 'default',
		},
		{
			fragments: ['DefaultedDateFieldOptions', "Type 'true'"],
			target: 'date',
		},
		{
			fragments: ["Type 'string' is not assignable to type 'never'"],
			target: 'onDelete',
		},
		{
			fragments: [
				'DefaultedStringFieldOptions',
				'FieldDefault<readonly string[]>',
			],
			target: 'default',
		},
	]

/** Reduces source and packed diagnostics to one stable assertion boundary. */
export const snapshotFieldOptionDiagnostics = (
	diagnostics: readonly ts.Diagnostic[],
): readonly FieldOptionDiagnosticSnapshot[] =>
	diagnostics.map(({ file, length, messageText, start }) => ({
		message: ts.flattenDiagnosticMessageText(messageText, '\n'),
		target:
			file === undefined || start === undefined || length === undefined
				? undefined
				: file.text.slice(start, start + length),
	}))

/** Applies the same actionable-diagnostic contract to source and packed types. */
export const expectActionableFieldOptionDiagnostics = (
	diagnostics: readonly ts.Diagnostic[],
): void => {
	const snapshots = snapshotFieldOptionDiagnostics(diagnostics)

	expect(snapshots).toHaveLength(fieldOptionDiagnosticExpectations.length)
	for (const [
		index,
		expectation,
	] of fieldOptionDiagnosticExpectations.entries()) {
		const diagnostic = snapshots[index]

		expect(diagnostic?.target).toBe(expectation.target)
		expect(diagnostic?.message).not.toMatch(/Expected \d+ arguments?/u)
		for (const fragment of expectation.fragments) {
			expect(diagnostic?.message).toContain(fragment)
		}
	}
}
