import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	createQueryNullFilter,
	createQueryJsonPathFilter,
	createQueryKeyFilter,
	createQueryListFilter,
	createQueryMembershipFilter,
	createQueryRangeFilter,
	createQueryRegexFilter,
	createQueryStructuralFilter,
	createQueryValueFilter,
	fieldPath,
} from './factory.js'

const fixtureSchema = Schema.define({
	className: 'Fixture',
	fields: (field) => ({
		title: field.string(),
		requiredTitle: field.string({ validation: { required: true } }),
		count: field.int(),
		tags: field.string({ list: true }),
		metadata: field.object({
			fields: (field) => ({
				aliases: field.string({ list: true }),
				label: field.string(),
			}),
		}),
		payload: field.json(),
		documents: field.json({ list: true }),
	}),
})

describe('query filter factories', () => {
	it('rejects malformed membership and regex values at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization still protects JavaScript callers.
			createQueryMembershipFilter(fixtureSchema, 'in', 'title', 'invalid')
		}).toThrow(new TypeError('query membership values must be an array'))
		expect(() => {
			// @ts-expect-error -- Regex patterns must be inert records.
			createQueryRegexFilter(fixtureSchema, 'title', null)
		}).toThrow(new TypeError('query regex pattern must be an object'))
		expect(() => {
			createQueryRegexFilter(fixtureSchema, 'title', {
				// @ts-expect-error -- Runtime normalization rejects non-string sources.
				source: 42,
				flags: [],
			})
		}).toThrow(new TypeError('query regex source must be a string'))
		expect(() => {
			createQueryRegexFilter(fixtureSchema, 'title', {
				source: 'fixture',
				// @ts-expect-error -- Runtime normalization rejects non-array flags.
				flags: 'case-insensitive',
			})
		}).toThrow(new TypeError('query regex flags must be an array'))
		expect(() => {
			createQueryRegexFilter(fixtureSchema, 'title', {
				source: 'fixture',
				// @ts-expect-error -- Runtime normalization rejects undeclared flags.
				flags: [42],
			})
		}).toThrow(new TypeError('query regex flag must be a declared flag'))
		expect(() => {
			createQueryRegexFilter(fixtureSchema, 'title', {
				source: 'fixture',
				// @ts-expect-error -- Runtime normalization rejects unknown string flags.
				flags: ['global'],
			})
		}).toThrow(new TypeError('query regex flag must be a declared flag'))
	})

	it('rejects unsupported field capabilities and malformed null values', () => {
		expect(
			createQueryValueFilter(fixtureSchema, 'equal', 'title', null),
		).toStrictEqual({ kind: 'equal', field: 'title', value: null })
		expect(() =>
			createQueryValueFilter(fixtureSchema, 'equal', 'requiredTitle', null),
		).toThrow(TypeError)
		expect(() =>
			createQueryValueFilter(fixtureSchema, 'equal', 'metadata', {}),
		).toThrow(
			new TypeError('query operator equal does not support object fields'),
		)
		expect(
			createQueryValueFilter(fixtureSchema, 'equal', 'tags', ['tag']),
		).toStrictEqual({ kind: 'equal', field: 'tags', value: ['tag'] })
		expect(() =>
			createQueryValueFilter(fixtureSchema, 'equal', 'tags', 'tag'),
		).toThrow(new TypeError('query filter value must be a list'))
		expect(
			createQueryRangeFilter(fixtureSchema, 'between', 'count', 1, 10),
		).toStrictEqual({
			kind: 'between',
			field: 'count',
			lower: 1,
			upper: 10,
		})
		expect(() =>
			createQueryRangeFilter(fixtureSchema, 'not-between', 'count', null, 10),
		).toThrow(new TypeError('query range lower bound must not be null'))
		expect(() =>
			createQueryRangeFilter(fixtureSchema, 'between', 'tags', 'a', 'z'),
		).toThrow(
			new TypeError('query operator between does not support list fields'),
		)
		expect(() =>
			createQueryRangeFilter(fixtureSchema, 'between', 'count', 1.5, 10),
		).toThrow(TypeError)
		expect(() => {
			// @ts-expect-error -- Runtime normalization rejects non-boolean null state.
			createQueryNullFilter(fixtureSchema, 'title', 'true')
		}).toThrow(new TypeError('query null value must be a boolean'))
	})

	it('validates and snapshots one-dimensional list filters', () => {
		const values = ['typescript', 'node']
		const filter = createQueryListFilter(
			fixtureSchema,
			'list-has-some',
			'tags',
			values,
		)

		expect(filter).toStrictEqual({
			field: 'tags',
			kind: 'list-has-some',
			values,
		})
		expect(Object.isFrozen(filter)).toBe(true)
		values[0] = 'changed'
		expect(filter).toStrictEqual({
			field: 'tags',
			kind: 'list-has-some',
			values: ['typescript', 'node'],
		})
		expect(
			createQueryListFilter(fixtureSchema, 'list-has', 'tags', 'typed'),
		).toStrictEqual({ field: 'tags', kind: 'list-has', value: 'typed' })
		expect(
			createQueryListFilter(fixtureSchema, 'list-empty', 'tags'),
		).toStrictEqual({ field: 'tags', kind: 'list-empty' })
		expect(() =>
			createQueryListFilter(fixtureSchema, 'list-has', 'tags', null),
		).toThrow(new TypeError('query list value must not be null'))
		expect(() =>
			createQueryListFilter(fixtureSchema, 'list-has', 'title', 'typed'),
		).toThrow(new TypeError('query operator list-has requires a list field'))
	})

	it('rejects a forged schema entry without a declared field definition', () => {
		const malformedSchema = {
			className: 'Fixture',
			fields: { title: undefined },
		} as unknown as typeof fixtureSchema

		expect(() =>
			createQueryValueFilter(malformedSchema, 'equal', 'title', 'fixture'),
		).toThrow(
			new TypeError('query filter field must reference a field definition'),
		)
	})

	it('validates structured targets, paths, partial values, and key collections', () => {
		expect(
			createQueryStructuralFilter(fixtureSchema, 'contains', 'metadata', {}),
		).toStrictEqual({ kind: 'contains', field: 'metadata', value: {} })
		expect(
			createQueryValueFilter(
				fixtureSchema,
				'equal',
				fieldPath('metadata', ['label']),
				'typed',
			),
		).toStrictEqual({
			field: 'metadata',
			kind: 'equal',
			path: ['label'],
			value: 'typed',
		})
		expect(() =>
			createQueryStructuralFilter(fixtureSchema, 'contains', 'metadata', {
				unknown: true,
			}),
		).toThrow(
			new TypeError('query filter value.unknown is not a declared field'),
		)
		expect(() =>
			createQueryStructuralFilter(fixtureSchema, 'contains', 'metadata', {
				aliases: [null],
			}),
		).toThrow(new TypeError('query filter value.aliases[0] must be a string'))
		expect(() =>
			createQueryValueFilter(
				fixtureSchema,
				'equal',
				fieldPath('metadata', ['unknown']),
				'typed',
			),
		).toThrow(
			new TypeError(
				'query field path references unknown object field "unknown" at index 0',
			),
		)
		expect(() =>
			createQueryValueFilter(
				fixtureSchema,
				'equal',
				fieldPath('title', ['nested']),
				'typed',
			),
		).toThrow(
			new TypeError(
				'query field paths require a non-list json or object root field',
			),
		)
		expect(() => {
			// @ts-expect-error -- Runtime validation rejects empty path arrays.
			fieldPath('payload', [])
		}).toThrow(
			new TypeError('query field path must contain at least one segment'),
		)
		expect(() =>
			createQueryKeyFilter(
				fixtureSchema,
				'has-any-keys',
				'payload',
				// @ts-expect-error -- Runtime validation rejects non-string keys.
				['valid', 42],
			),
		).toThrow(new TypeError('query keys must be an array of strings'))
	})

	it('snapshots advanced JSONPath expressions without interpreting their source', () => {
		const variables = { minimum: 10, options: { active: true } }
		const filter = createQueryJsonPathFilter(
			fixtureSchema,
			'json-path-exists',
			'payload',
			{
				source: '$.items[*] ? (@.price > $minimum)',
				variables,
			},
		)

		expect(filter).toStrictEqual({
			field: 'payload',
			kind: 'json-path-exists',
			source: '$.items[*] ? (@.price > $minimum)',
			variables,
		})
		expect(filter).not.toHaveProperty('expression')
		expect(Object.isFrozen(filter)).toBe(true)

		if (!('variables' in filter)) {
			throw new TypeError('JSONPath fixture must retain variables')
		}

		expect(Object.isFrozen(filter.variables)).toBe(true)
		expect(filter.variables).not.toBe(variables)

		variables.minimum = 99
		variables.options.active = false

		expect(filter.variables).toStrictEqual({
			minimum: 10,
			options: { active: true },
		})
	})

	it('rejects malformed JSONPath expression boundaries', () => {
		expect(() =>
			createQueryJsonPathFilter(
				fixtureSchema,
				'json-path-exists',
				'payload',
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				null,
			),
		).toThrow(new TypeError('query JSONPath expression must be an object'))
		expect(() =>
			createQueryJsonPathFilter(fixtureSchema, 'json-path-exists', 'payload', {
				source: '',
			}),
		).toThrow(new TypeError('query JSONPath source must be a non-empty string'))
		expect(() =>
			createQueryJsonPathFilter(fixtureSchema, 'json-path-matches', 'payload', {
				source: '$.active == true',
				// @ts-expect-error -- Variables must be a JSON object.
				variables: [],
			}),
		).toThrow(new TypeError('query JSONPath variables must be an object'))
		expect(() =>
			createQueryJsonPathFilter(
				fixtureSchema,
				'json-path-exists',
				// @ts-expect-error -- Runtime validation rejects structured list roots.
				'documents',
				{ source: '$[*]' },
			),
		).toThrow(
			new TypeError(
				'query operator json-path-exists does not support list fields',
			),
		)
	})
})
