import { describe, expect, it } from 'vitest'

import {
	intField,
	readFieldInferenceState,
	relationField,
	Schema,
	stringField,
} from '../../../index.js'

describe('readFieldInferenceState', () => {
	it('describes required, defaulted, immutable, and listed scalar fields', () => {
		expect(
			readFieldInferenceState(stringField({ validation: { required: true } })),
		).toStrictEqual({
			create: 'required',
			list: false,
			nullable: false,
			object: 'required',
			update: 'optional',
		})
		expect(
			readFieldInferenceState(
				stringField({
					default: [['draft']] as const,
					immutable: true,
					list: [true, true],
					validation: { required: true },
				}),
			),
		).toStrictEqual({
			create: 'optional',
			list: [true, true],
			nullable: false,
			object: 'required',
			update: 'forbidden',
		})
	})

	it('describes generated and relation fields without inventing values', () => {
		const Target = Schema.define({
			className: 'InferenceStateTarget',
			fields: {},
		})

		expect(
			readFieldInferenceState(intField({ autoIncrement: true })),
		).toMatchObject({
			create: 'optional',
			nullable: false,
			update: 'optional',
		})
		expect(
			readFieldInferenceState(relationField({ target: () => Target })),
		).toStrictEqual({
			create: 'forbidden',
			list: false,
			nullable: false,
			object: 'forbidden',
			update: 'forbidden',
		})
	})
})
