import { describe, expect, it } from 'vitest'

import {
	intField,
	readFieldTypeState,
	relationField,
	stringField,
} from '../../../index.js'
import { UltimaBase } from '../../../runtime/application/ultima-base.js'

describe('readFieldTypeState', () => {
	it('describes required, defaulted, immutable, and listed scalar fields', () => {
		expect(readFieldTypeState(stringField({ required: true }))).toStrictEqual({
			create: 'required',
			list: false,
			nullable: false,
			object: 'required',
			update: 'optional',
		})
		expect(
			readFieldTypeState(
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
		const Target = UltimaBase.Schema.define({
			className: 'InferenceStateTarget',
			fields: () => ({}),
		})

		expect(readFieldTypeState(intField({ autoIncrement: true }))).toMatchObject(
			{
				create: 'optional',
				nullable: false,
				update: 'optional',
			},
		)
		expect(
			readFieldTypeState(relationField({ target: () => Target })),
		).toStrictEqual({
			create: 'forbidden',
			list: false,
			nullable: false,
			object: 'forbidden',
			update: 'forbidden',
		})
	})
})
