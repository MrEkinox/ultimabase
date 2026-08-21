import { describe, expect, it } from 'vitest'

import {
	intField,
	readFieldTypegenState,
	relationField,
	Schema,
	stringField,
} from '../../../index.js'

describe('readFieldTypegenState', () => {
	it('describes required, defaulted, immutable, and listed scalar fields', () => {
		expect(
			readFieldTypegenState(stringField({ required: true })),
		).toStrictEqual({
			create: 'required',
			list: false,
			nullable: false,
			object: 'required',
			update: 'optional',
		})
		expect(
			readFieldTypegenState(
				stringField({
					default: ['draft'] as const,
					immutable: true,
					list: true,
					required: true,
				}),
			),
		).toStrictEqual({
			create: 'optional',
			list: true,
			nullable: false,
			object: 'required',
			update: 'forbidden',
		})
	})

	it('describes generated and relation fields without inventing values', () => {
		const Target = Schema.define({
			className: 'InferenceStateTarget',
			fields: () => ({}),
		})

		expect(
			readFieldTypegenState(intField({ autoIncrement: true })),
		).toMatchObject({
			create: 'optional',
			nullable: false,
			update: 'optional',
		})
		expect(
			readFieldTypegenState(relationField({ target: () => Target })),
		).toStrictEqual({
			create: 'forbidden',
			list: false,
			nullable: false,
			object: 'forbidden',
			update: 'forbidden',
		})
	})
})
