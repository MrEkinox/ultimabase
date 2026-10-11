import { describe, expect, it } from 'vitest'
import { isPlainRecord } from '@ultimabase/shared'

import {
	definePluginField,
	definePluginFieldWireProtocol,
	getPluginFieldStructuralContains,
	getPluginFieldStorageCodec,
	getPluginFieldWireCodec,
	readPluginFieldExistingRows,
	readPluginFieldStorageDefault,
	type FieldOptions,
} from '../index.js'
import { UltimaBase } from '../../index.js'
import {
	hasFieldUpdateInput,
	snapshotUpdateInputFieldValue,
} from './base/plugin-field-metadata.js'

interface FixtureFieldOptions extends FieldOptions<string> {
	readonly storageProfile?: string
}

const snapshotValue = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a string`)
	}

	return value
}

describe('plugin fields', () => {
	it('reuses common immutable field metadata for namespaced kinds', () => {
		const source = ['first']
		const field = definePluginField(
			'fixture.custom',
			{
				list: true,
				default: source,
				required: true,
			},
			{ snapshotValue },
		)

		source[0] = 'changed'

		expect(field).toStrictEqual({
			kind: 'fixture.custom',
			options: {
				list: true,
				default: ['first'],
				required: true,
			},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it('leaves plugin-owned option keys to the plugin normalizer', () => {
		const field = definePluginField<
			string,
			'fixture.owned-options',
			FixtureFieldOptions
		>(
			'fixture.owned-options',
			{
				storageProfile: 'compact',
				required: true,
			},
			{ snapshotValue },
		)

		expect(field.options).toStrictEqual({
			storageProfile: 'compact',
			required: true,
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

	it('keeps nominal wire codecs private and separated by protocol identity', () => {
		const protocol = definePluginFieldWireProtocol({
			name: 'fixture.transport',
			version: '1.0.0',
		})
		const equivalentProtocol = definePluginFieldWireProtocol({
			name: 'fixture.transport',
			version: '1.0.0',
		})
		const otherProtocol = definePluginFieldWireProtocol({
			name: 'fixture.transport',
			version: '2.0.0',
		})
		const field = definePluginField(
			'fixture.wired',
			{},
			{
				snapshotValue,
				wireCodecs: [
					{
						decode: (value) => String(value),
						encode: (value) => ({ value }),
						format: 'json',
						protocol,
					},
				],
			},
		)
		const codec = getPluginFieldWireCodec(field, protocol)

		expect(field).toStrictEqual({ kind: 'fixture.wired', options: {} })
		expect(codec?.decode('value')).toBe('value')
		expect(codec?.encode('value')).toStrictEqual({ value: 'value' })
		expect(equivalentProtocol).toBe(protocol)
		expect(getPluginFieldWireCodec(field, equivalentProtocol)).toBe(codec)
		expect(getPluginFieldWireCodec(field, otherProtocol)).toBeUndefined()
		expect(() => codec?.encode(42)).toThrow(
			'Encoded plugin field wire value must be a string',
		)
	})

	it.each([
		[{ name: 'transport', version: '1.0.0' }, 'name must be namespaced'],
		[{ name: 'fixture.transport', version: '^1.0.0' }, 'exact SemVer'],
	])('rejects invalid field wire protocol options %#', (options, message) => {
		expect(() => definePluginFieldWireProtocol(options)).toThrow(message)
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
				definePluginField(kind, {}, { snapshotValue })
			}).toThrow()
		},
	)

	it('carries update inputs, existing-rows values and storage defaults (ADR-0321)', () => {
		const Fixture = UltimaBase.Schema.define({
			className: 'PluginFieldMetadataFixture',
			fields: () => ({}),
		})
		const field = definePluginField(
			'fixture.metadata',
			{ required: true },
			{
				snapshotValue,
				snapshotUpdateInput: (value, path) =>
					typeof value === 'object' && value !== null && 'append' in value
						? value
						: snapshotValue(value, path),
				existingRows: (schema) =>
					schema.className === 'PluginFieldMetadataFixture'
						? { value: 'existing' }
						: { missing: 'Declare existing rows.' },
				storageDefault: 'stored',
			},
		)
		const plain = definePluginField('fixture.plain', {}, { snapshotValue })

		expect(hasFieldUpdateInput(field)).toBe(true)
		expect(hasFieldUpdateInput(plain)).toBe(false)
		expect(
			snapshotUpdateInputFieldValue(field, { append: 'x' }, 'data.metadata'),
		).toStrictEqual({ append: 'x' })
		expect(() =>
			snapshotUpdateInputFieldValue(plain, { append: 'x' }, 'data.plain'),
		).toThrow(new TypeError('data.plain must be a string'))
		expect(readPluginFieldExistingRows(field, Fixture)).toStrictEqual({
			value: 'existing',
		})
		expect(readPluginFieldExistingRows(plain, Fixture)).toBeUndefined()
		expect(readPluginFieldStorageDefault(field)).toStrictEqual({
			value: 'stored',
		})
		expect(readPluginFieldStorageDefault(plain)).toBeUndefined()
		expect(() =>
			definePluginField(
				'fixture.invalid',
				{},
				{ snapshotValue, existingRows: 'value' as never },
			),
		).toThrow(new TypeError('Plugin field existingRows must be a function'))
		expect(() =>
			definePluginField(
				'fixture.invalid',
				{},
				{ snapshotValue, storageDefault: 1 as never },
			),
		).toThrow(new TypeError('Plugin field storageDefault must be a string'))
	})
})
