import { Schema, intField, objectField, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import {
	createQueryExistenceFilter,
	createQueryMembershipFilter,
	createQueryRegexFilter,
	createQueryValueFilter,
} from './factory.js'

const fixtureSchema = new Schema({
	className: 'Fixture',
	fields: {
		title: stringField(),
		requiredTitle: stringField({ validation: { required: true } }),
		count: intField(),
		tags: stringField({ list: true }),
		metadata: objectField({ fields: { label: stringField() } }),
	},
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

	it('rejects unsupported field capabilities and malformed existence values', () => {
		expect(() =>
			createQueryValueFilter(fixtureSchema, 'equal', 'title', null),
		).toThrow(TypeError)
		expect(() =>
			createQueryValueFilter(fixtureSchema, 'equal', 'requiredTitle', null),
		).toThrow(TypeError)
		expect(() =>
			createQueryValueFilter(fixtureSchema, 'equal', 'metadata', {}),
		).toThrow(
			new TypeError('query operator equal does not support object fields'),
		)
		expect(() =>
			createQueryValueFilter(fixtureSchema, 'equal', 'tags', 'tag'),
		).toThrow(
			new TypeError('query operator equal does not support list fields'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime normalization rejects non-boolean presence state.
			createQueryExistenceFilter(fixtureSchema, 'title', 'true')
		}).toThrow(new TypeError('query exists value must be a boolean'))
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
})
