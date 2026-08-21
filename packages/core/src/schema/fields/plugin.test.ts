import { describe, expect, it } from 'vitest'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	definePluginField,
	defineFieldExtension,
	getPluginFieldStructuralContains,
	getPluginFieldStorageCodec,
	type FieldOptions,
	type FieldValidationOptions,
} from '../index.js'

interface FixtureValidationOptions extends FieldValidationOptions {
	readonly dimensions?: number
}

interface FixtureFieldOptions extends FieldOptions<
	string,
	FixtureValidationOptions
> {
	readonly storageProfile?: string
}

const normalizeValidation = (
	validation: FieldValidationOptions,
): Readonly<FieldValidationOptions> => immutableRecord(validation)

const snapshotValue = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a string`)
	}

	return value
}

describe('plugin fields', () => {
	it('reuses common immutable field metadata for namespaced kinds', () => {
		const extension = defineFieldExtension('fixture.trace', { enabled: true })
		const source = ['first']
		const field = definePluginField(
			'fixture.custom',
			{
				list: true,
				default: source,
				validation: { required: true },
				extensions: [extension],
			},
			{ normalizeValidation, snapshotValue },
		)

		source[0] = 'changed'

		expect(field).toStrictEqual({
			kind: 'fixture.custom',
			options: {
				list: true,
				default: ['first'],
				validation: { required: true },
				extensions: [extension],
			},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it('uses flat validation by default and snapshots plugin normalization output', () => {
		const validation = { required: true }
		const field = definePluginField(
			'fixture.default-normalizer',
			{ validation },
			{ snapshotValue },
		)

		validation.required = false

		// Schema owns common metadata even when the plugin omits a custom normalizer.
		expect(field.options.validation.required).toBe(true)
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it('leaves plugin-owned option keys to the plugin normalizer', () => {
		const field = definePluginField<
			string,
			'fixture.owned-options',
			FixtureValidationOptions,
			FixtureFieldOptions
		>(
			'fixture.owned-options',
			{
				storageProfile: 'compact',
				validation: { dimensions: 3, required: true },
			},
			{
				normalizeValidation: (validation) => immutableRecord(validation),
				snapshotValue,
			},
		)

		expect(field.options).toStrictEqual({
			storageProfile: 'compact',
			validation: { dimensions: 3, required: true },
		})
	})

	it('keeps versioned storage codecs private and reapplies scalar snapshots', () => {
		const field = definePluginField(
			'fixture.stored',
			{},
			{
				snapshotValue,
				storageCodec: {
					decode: (value: unknown): string => {
						if (!isPlainRecord(value) || typeof value.value !== 'string') {
							throw new TypeError('Stored fixture value must contain a string')
						}

						return value.value
					},
					encode: (value: string) => ({ value }),
					format: 'json',
					version: 1,
				},
			},
		)
		const codec = getPluginFieldStorageCodec(field)

		expect(field).toStrictEqual({ kind: 'fixture.stored', options: {} })
		expect(codec?.encode('value')).toStrictEqual({ value: 'value' })
		expect(codec?.decode({ value: 'stored' })).toBe('stored')
		expect(Object.isFrozen(codec)).toBe(true)
		expect(() => codec?.encode(42)).toThrow(
			'Encoded plugin field value must be a string',
		)
		expect(() => codec?.decode({ value: 42 })).toThrow(
			'Stored fixture value must contain a string',
		)
	})

	it('exposes only inert structural containment metadata', () => {
		const field = definePluginField(
			'fixture.contained',
			{},
			{
				snapshotValue,
				storageCodec: {
					decode: (value) => snapshotValue(value, 'stored value'),
					encode: String,
					format: 'json',
					version: 1,
				},
				structuralContains: {
					snapshotOperand: (value: unknown) => value,
				},
			},
		)
		const metadata = getPluginFieldStructuralContains(field)

		expect(field).toStrictEqual({ kind: 'fixture.contained', options: {} })
		expect(metadata).toStrictEqual({ format: 'json', protocolVersion: 1 })
		expect(Object.isFrozen(metadata)).toBe(true)
		expect('snapshotOperand' in (metadata ?? {})).toBe(false)
	})

	it('rejects containment without a codec and on list fields', () => {
		expect(() =>
			definePluginField(
				'fixture.no-codec',
				{},
				{
					snapshotValue,
					structuralContains: {
						snapshotOperand: (value: unknown) => value,
					} as never,
				},
			),
		).toThrow('structuralContains requires a JSON storageCodec')

		expect(() =>
			definePluginField(
				'fixture.list-containment',
				{ list: true },
				{
					snapshotValue,
					storageCodec: {
						decode: (value) => snapshotValue(value, 'stored value'),
						encode: String,
						format: 'json',
						version: 1,
					},
					structuralContains: {
						snapshotOperand: (value: unknown) => value,
					} as never,
				},
			),
		).toThrow('structuralContains does not support list fields')

		expect(() =>
			definePluginField(
				'fixture.malformed-containment',
				{},
				{
					snapshotValue,
					storageCodec: {
						decode: (value) => snapshotValue(value, 'stored value'),
						encode: String,
						format: 'json',
						version: 1,
					},
					structuralContains: {
						unknown: true,
						snapshotOperand: (value: unknown) => value,
					},
				},
			),
		).toThrow('Unknown plugin field structuralContains key: unknown')
	})

	it.each([
		{
			codec: {
				decode: snapshotValue,
				encode: String,
				format: 'json',
				version: 0,
			},
			message: 'version must be a positive safe integer',
		},
		{
			codec: {
				decode: snapshotValue,
				encode: String,
				format: 'json',
				unknown: true,
				version: 1,
			},
			message: 'Unknown plugin field storageCodec key: unknown',
		},
	] as const)('rejects malformed storage codecs', ({ codec, message }) => {
		expect(() =>
			definePluginField(
				'fixture.invalid-storage',
				{},
				{
					snapshotValue,
					// @ts-expect-error -- Runtime validation protects untyped plugin metadata.
					storageCodec: codec,
				},
			),
		).toThrow(message)
	})

	it.each(['', 'string', 'pointer', 'plugin'] as const)(
		'rejects the unavailable kind %s at runtime',
		(kind) => {
			expect(() => {
				// @ts-expect-error -- Runtime validation protects untyped plugin packages.
				definePluginField(kind, {}, { normalizeValidation, snapshotValue })
			}).toThrow()
		},
	)
})
