import { describe, expect, it } from 'vitest'

import {
	bigintField,
	booleanField,
	dateTimeField,
	defineExtensions,
	defineFieldExtension,
	definePluginField,
	defineSchema,
	enumField,
	floatField,
	intField,
	objectField,
	stringField,
	timeField,
	uuidField,
} from '../src/index.js'

describe('runtime declaration boundaries', () => {
	it.each([
		[
			'required',
			{ validation: { required: 'yes' } },
			'validation.required must be a boolean',
		],
		[
			'nullable',
			{ validation: { nullable: 1 } },
			'validation.nullable must be a boolean',
		],
		[
			'contradictory presence',
			{ validation: { required: true, nullable: true } },
			'validation.required and validation.nullable cannot both be true',
		],
		['immutability', { immutable: 'yes' }, 'immutable must be a boolean'],
		[
			'indexing',
			{ indexed: 'primary' },
			'indexed must be a boolean or "unique"',
		],
		['description', { description: 42 }, 'description must be a string'],
	] as const)(
		'rejects invalid common %s metadata',
		(_label, options, message) => {
			expect(() => {
				// @ts-expect-error -- Runtime coverage crosses the typed common option boundary.
				stringField(options)
			}).toThrow(new TypeError(message))
		},
	)

	it('rejects malformed option and validation containers', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects null JavaScript options.
			stringField(null)
		}).toThrow(new TypeError('field options must be an object'))
		expect(() => {
			// @ts-expect-error -- Validation metadata must retain its named object shape.
			stringField({ validation: [] })
		}).toThrow(new TypeError('validation must be an object'))
	})

	it.each([
		['bigint', bigintField],
		['integer', intField],
		['float', floatField],
		['enum', enumField],
		['object', objectField],
		['time', timeField],
		['date-time', dateTimeField],
	] as const)(
		'rejects null options before reading %s metadata',
		(_label, factory) => {
			expect(() => {
				// @ts-expect-error -- Runtime coverage protects specialized JavaScript factories.
				factory(null)
			}).toThrow(new TypeError('field options must be an object'))
		},
	)

	it('rejects a malformed object field map before composition', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects non-record object field maps.
			objectField({ fields: [] })
		}).toThrow(new TypeError('fields must be a field map'))
	})

	it.each([
		['string', stringField, 42, 'default must be a string'],
		['boolean', booleanField, 0, 'default must be a boolean'],
		['integer', intField, 1.5, 'default must be a safe integer'],
		['float', floatField, '1.5', 'default must be a number'],
		['bigint', bigintField, 1, 'default must be a bigint'],
		['UUID', uuidField, 7, 'default must be a string'],
	] as const)(
		'rejects an invalid %s default',
		(_label, factory, value, message) => {
			expect(() => {
				// @ts-expect-error -- Runtime coverage models untyped default values.
				factory({ default: value })
			}).toThrow(new TypeError(message))
		},
	)

	it('rejects malformed built-in-specific metadata', () => {
		expect(() => {
			// @ts-expect-error -- Match metadata must remain a native regular expression.
			stringField({ validation: { match: 'pattern' } })
		}).toThrow(new TypeError('validation.match must be a RegExp'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects integer sequence metadata.
			intField({ autoIncrement: 'yes' })
		}).toThrow(new TypeError('autoIncrement must be a boolean'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects bigint sequence metadata.
			bigintField({ autoIncrement: 1 })
		}).toThrow(new TypeError('autoIncrement must be a boolean'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects float constraint flags.
			floatField({ validation: { finite: 'yes' } })
		}).toThrow(new TypeError('validation.finite must be a boolean'))
	})

	it('rejects malformed schemas before copying their metadata', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects null schema options.
			defineSchema(null)
		}).toThrow(new TypeError('schema options must be an object'))
		expect(() => defineSchema({ className: '', fields: {} })).toThrow(
			new TypeError('className must be a non-empty string'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects non-record field maps.
			defineSchema({ className: 'Invalid', fields: [] })
		}).toThrow(new TypeError('fields must be an object'))
		expect(() =>
			defineSchema({ className: 'Invalid', fields: { '': stringField() } }),
		).toThrow(new TypeError('schema field name must be a non-empty string'))
		expect(() => {
			// Runtime validation rejects structural definitions without a namespace.
			defineSchema({
				className: 'Invalid',
				fields: { custom: { kind: 'custom', options: {} } },
			})
		}).toThrow(
			new TypeError('fields.custom.kind must use a namespaced identifier'),
		)
	})

	it('rejects malformed extensions and plugin identifiers', () => {
		expect(() => defineFieldExtension('', {})).toThrow(
			new TypeError('extension name must be a non-empty string'),
		)
		expect(() => {
			// Arrays satisfy the TypeScript object constraint but are not configuration records.
			defineFieldExtension('fixture.invalid', [])
		}).toThrow(new TypeError('extension config must be an object'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects non-list extension input.
			defineExtensions({})
		}).toThrow(new TypeError('extensions must be a list'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects malformed extension entries.
			defineExtensions([{ scope: 'field' }])
		}).toThrow(new TypeError('Invalid extension definition'))
		expect(() => {
			definePluginField(
				// Runtime validation adds identifier syntax that template literals cannot express.
				'fixture. invalid',
				{},
				{ normalizeValue: (value: unknown): unknown => value },
			)
		}).toThrow(
			new TypeError('Plugin field kind must use a namespaced identifier'),
		)
		expect(() => {
			// @ts-expect-error -- A plugin field must own its scalar normalizer.
			definePluginField('fixture.invalid', {}, {})
		}).toThrow(new TypeError('Plugin field normalizeValue must be a function'))
		expect(() => {
			definePluginField(
				'fixture.invalid',
				{ validation: {} },
				{
					normalizeValue: (value: unknown): unknown => value,
					// @ts-expect-error -- A provided validation normalizer must be callable.
					normalizeValidation: true,
				},
			)
		}).toThrow(
			new TypeError(
				'Plugin field normalizeValidation must be a function when provided',
			),
		)
		expect(() => {
			definePluginField(
				'fixture.invalid',
				{ validation: {} },
				{
					normalizeValue: (value: unknown): unknown => value,
					// @ts-expect-error -- Runtime coverage protects malformed normalizer output.
					normalizeValidation: (): readonly unknown[] => [],
				},
			)
		}).toThrow(new TypeError('normalized validation must be an object'))
	})
})
