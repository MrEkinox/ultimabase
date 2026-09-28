import { onTestFinished } from 'vitest'
import { describe, expect, it } from 'vitest'

import {
	compileValidationPlans,
	UltimaBase,
	Schema,
	SchemaRegistry,
} from '@ultimabase/core'

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

		const schema = Schema.define({
			className: 'DetachedVectorOptions',
			fields: () => ({ embedding: field }),
		})
		new SchemaRegistry([schema]).compileSchemas()
		const plan = compileValidationPlans(schema).create.fields.embedding

		if (plan === undefined || !isVectorFieldValidationPlan(plan)) {
			throw new TypeError('Expected Schema to preserve the vector scalar plan')
		}

		expect(plan.field.options.default).toStrictEqual([1, 2])
	})

	it('claims and reads a vector plan preserved by Schema', async () => {
		const field = vectorField({
			dimensions: 3,
			required: true,
		})
		const schema = Schema.define({
			className: 'Document',
			fields: () => ({ embedding: field }),
		})
		const application = new UltimaBase({
			plugins: [pgVectorPlugin()],
			schemas: [schema],
		})
		await application.initialize()
		onTestFinished(() => application.dispose())
		const plan = compileValidationPlans(schema).create.fields.embedding

		expect(field.kind).toBe(vectorFieldKind)
		expect(plan).toStrictEqual({
			kind: 'scalar',
			field,
			presence: 'required',
			nullable: false,
		})
		expect(plan === undefined ? false : isVectorFieldValidationPlan(plan)).toBe(
			true,
		)
	})

	it('does not claim another plugin field kind', () => {
		const foreignPlan = {
			kind: 'scalar',
			field: { kind: 'fixture.foreign', options: {} },
			presence: 'optional',
			nullable: false,
		} as const

		expect(isVectorFieldValidationPlan(foreignPlan)).toBe(false)
	})
})
