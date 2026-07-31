import { describe, expect, it } from 'vitest'

import { compileValidationPlans, defineSchema } from '@ultimabase/schema'

import {
	isVectorFieldValidationPlan,
	pgVectorPlugin,
	vectorField,
	vectorFieldKind,
} from '../src/index.js'

describe('pgVectorPlugin field plans', () => {
	it('claims and reads a vector plan preserved by Schema', () => {
		const field = vectorField({
			dimensions: 3,
			validation: { required: true },
		})
		const schema = defineSchema({
			className: 'Document',
			fields: { embedding: field },
		})
		const plan = compileValidationPlans(schema).create.fields.embedding
		const plugin = pgVectorPlugin()

		expect(plan).toStrictEqual({
			kind: 'plugin',
			fieldKind: vectorFieldKind,
			field,
			presence: 'required',
			nullable: false,
		})
		expect(plan === undefined ? false : plugin.handles(plan)).toBe(true)
		expect(plan === undefined ? false : isVectorFieldValidationPlan(plan)).toBe(
			true,
		)
	})

	it('validates runtime values through the associated plugin definition', () => {
		const schema = defineSchema({
			className: 'Document',
			fields: {
				embedding: vectorField({ dimensions: 2 }),
			},
		})
		const plan = compileValidationPlans(schema).create.fields.embedding
		const plugin = pgVectorPlugin()

		if (plan === undefined || !plugin.handles(plan)) {
			throw new TypeError('Expected Schema to preserve the vector plugin plan')
		}

		const source = [1, 2]
		const value = plugin.validate(source, plan)

		source[0] = 9

		expect(value).toStrictEqual([1, 2])
		expect(Object.isFrozen(value)).toBe(true)
		expect(() => plugin.validate([1], plan)).toThrow(
			new RangeError('value must contain exactly 2 values'),
		)
	})

	it('does not claim another plugin field kind', () => {
		const plugin = pgVectorPlugin()
		const foreignPlan = {
			kind: 'plugin',
			fieldKind: 'fixture.foreign',
			field: { kind: 'fixture.foreign', options: {} },
			presence: 'optional',
			nullable: false,
		} as const

		expect(plugin.handles(foreignPlan)).toBe(false)
	})
})
