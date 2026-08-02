import { describe, expect, it } from 'vitest'

import { compileValidationPlans, Schema } from '@ultimabase/core'

import {
	isVectorFieldValidationPlan,
	pgVectorPlugin,
	vectorField,
	vectorFieldKind,
} from '../src/index.js'

describe('pgVectorPlugin field plans', () => {
	it('rejects malformed field options before reading vector metadata', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects JavaScript callers.
			vectorField(null)
		}).toThrow(new TypeError('field options must be an object'))
	})

	it('detaches snapshot dimensions from caller-owned options', () => {
		const options = { dimensions: 2, default: [1, 2] }
		const field = vectorField(options)

		options.dimensions = 3

		const schema = new Schema({
			className: 'DetachedVectorOptions',
			fields: { embedding: field },
		})
		const plan = compileValidationPlans(schema).create.fields.embedding

		if (plan === undefined || !isVectorFieldValidationPlan(plan)) {
			throw new TypeError('Expected Schema to preserve the vector scalar plan')
		}

		expect(plan.field.options.default).toStrictEqual([1, 2])
	})

	it('claims and reads a vector plan preserved by Schema', () => {
		const field = vectorField({
			dimensions: 3,
			validation: { required: true },
		})
		const schema = new Schema({
			className: 'Document',
			fields: { embedding: field },
		})
		const plan = compileValidationPlans(schema).create.fields.embedding
		const plugin = pgVectorPlugin()

		expect(plugin.fieldKind).toBe(vectorFieldKind)
		expect(plan).toStrictEqual({
			kind: 'scalar',
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
		const schema = new Schema({
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
			kind: 'scalar',
			field: { kind: 'fixture.foreign', options: {} },
			presence: 'optional',
			nullable: false,
		} as const

		expect(plugin.handles(foreignPlan)).toBe(false)
	})
})
