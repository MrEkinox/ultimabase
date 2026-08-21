import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'

import {
	bigintField,
	booleanField,
	dateTimeField,
	definePluginField,
	Schema,
	enumField,
	floatField,
	intField,
	objectField,
	stringField,
	timeField,
	uuidField,
} from '../../src/schema/index.js'
import { getFieldListDepth } from '../../src/schema/fields/base/options.js'

describe('runtime declaration boundaries', () => {
	it.each([
		[
			'legacy validation',
			{ validation: { required: true } },
			'validation must be a Standard Schema V1 validator',
		],
		['required', { required: 'yes' }, 'required must be a boolean'],
		[
			'legacy nullable validation',
			{ validation: { nullable: 1 } },
			'validation must be a Standard Schema V1 validator',
		],
		[
			'legacy contradictory presence',
			{ required: true, validation: { nullable: true } },
			'validation must be a Standard Schema V1 validator',
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
			// @ts-expect-error -- Validation must implement Standard Schema V1.
			stringField({ validation: [] })
		}).toThrow(
			new TypeError('validation must be a Standard Schema V1 validator'),
		)
		expect(() => getFieldListDepth({ list: 'invalid' })).toThrow(
			new TypeError('list must be true or false'),
		)
	})

	it('accepts object and callable Standard Schema validators by identity', () => {
		const objectValidator: StandardSchemaV1<string> = {
			'~standard': {
				version: 1 as const,
				vendor: 'object-fixture',
				validate: (value: unknown) =>
					typeof value === 'string'
						? { value }
						: { issues: [{ message: 'Expected string' }] },
			},
		}
		const callableValidator = Object.assign(() => undefined, {
			'~standard': {
				version: 1 as const,
				vendor: 'callable-fixture',
				validate: (value: unknown) =>
					typeof value === 'string'
						? { value }
						: { issues: [{ message: 'Expected string' }] },
			},
		}) satisfies StandardSchemaV1<string>
		const callableFieldValidator: StandardSchemaV1<string> = callableValidator

		expect(
			stringField({ validation: objectValidator }).options.validation,
		).toBe(objectValidator)
		expect(
			stringField({ validation: callableFieldValidator }).options.validation,
		).toBe(callableValidator)
	})

	it.each([
		[
			'unsupported version',
			{ version: 2, vendor: 'fixture', validate: () => ({ value: '' }) },
			'validation must use Standard Schema version 1',
		],
		[
			'malformed vendor',
			{ version: 1, vendor: 42, validate: () => ({ value: '' }) },
			'validation.~standard.vendor must be a string',
		],
		[
			'missing validate',
			{ version: 1, vendor: 'fixture' },
			'validation.~standard.validate must be a function',
		],
	] as const)(
		'rejects a Standard Schema protocol with %s',
		(_name, protocol, message) => {
			expect(() => {
				stringField({ validation: { '~standard': protocol } } as never)
			}).toThrow(new TypeError(message))
		},
	)

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
			stringField({ validation: { match: 'pattern' } } as never)
		}).toThrow(
			new TypeError('validation must be a Standard Schema V1 validator'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects integer sequence metadata.
			intField({ autoIncrement: 'yes' })
		}).toThrow(new TypeError('autoIncrement must be a boolean'))
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects bigint sequence metadata.
			bigintField({ autoIncrement: 1 })
		}).toThrow(new TypeError('autoIncrement must be a boolean'))
	})

	it('rejects malformed schemas before copying their metadata', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects null schema options.
			Schema.define(null)
		}).toThrow(new TypeError('schema options must be an object'))
		expect(() => Schema.define({ className: '', fields: () => ({}) })).toThrow(
			new TypeError('className must be a non-empty string'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime coverage protects non-record field maps.
			Schema.define({ className: 'Invalid', fields: () => [] })
		}).toThrow(new TypeError('Invalid.fields must return a field map'))
		expect(() =>
			Schema.define({
				className: 'Invalid',
				fields: (field) => ({ '': field.string() }),
			}),
		).toThrow(
			new TypeError('Invalid.fields field name must be a non-empty string'),
		)
		expect(() => {
			// Runtime validation rejects structural definitions without a namespace.
			Schema.define({
				className: 'Invalid',
				fields: () => ({ custom: { kind: 'custom', options: {} } }),
			})
		}).toThrow(
			new TypeError(
				'Invalid.fields.custom.kind must use a namespaced identifier',
			),
		)
		expect(() =>
			Schema.define({
				className: 'Forged',
				fields: () => ({ custom: { kind: 'fixture.custom', options: {} } }),
			}),
		).toThrow(
			new TypeError('Forged.fields.custom must be created by a field factory'),
		)
	})

	it('rejects malformed plugin identifiers', () => {
		expect(() => {
			definePluginField(
				// Runtime validation adds identifier syntax that template literals cannot express.
				'fixture. invalid',
				{},
				{ snapshotValue: (value: unknown): unknown => value },
			)
		}).toThrow(
			new TypeError('Plugin field kind must use a namespaced identifier'),
		)
		expect(() => {
			// @ts-expect-error -- A plugin field must own its scalar normalizer.
			definePluginField('fixture.invalid', {}, {})
		}).toThrow(new TypeError('Plugin field snapshotValue must be a function'))
		expect(() => {
			definePluginField('fixture.invalid', {}, {
				snapshotValue: (value: unknown): unknown => value,
				normalizeValidation: true,
			} as never)
		}).toThrow(
			new TypeError('Unknown plugin field normalizer key: normalizeValidation'),
		)
	})
})
