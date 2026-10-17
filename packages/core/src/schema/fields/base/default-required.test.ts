import { describe, expect, it } from 'vitest'

import {
	booleanField,
	compileValidationPlans,
	dateTimeField,
	enumField,
	intField,
	objectField,
	readFieldTypeState,
	stringField,
	UltimaBase,
} from '../../../index.js'

// ADR-0340: `required` is the one word for nullability. A default, `autoNow`
// or `autoIncrement` makes a stored field required; `required: false` beside a
// default keeps explicit `null` allowed.
describe('default requiredness', () => {
	it('derives non-null state from a default and nullable state from required: false', () => {
		expect(readFieldTypeState(booleanField({ default: false }))).toStrictEqual({
			create: 'optional',
			list: false,
			nullable: false,
			object: 'required',
			update: 'optional',
		})
		expect(
			readFieldTypeState(
				enumField({ values: ['a', 'b'], default: 'a', required: false }),
			),
		).toMatchObject({ create: 'optional', nullable: true })
		expect(
			readFieldTypeState(intField({ default: 0, required: true })),
		).toMatchObject({ create: 'optional', nullable: false })
		expect(readFieldTypeState(stringField())).toMatchObject({ nullable: true })
		expect(
			readFieldTypeState(stringField({ required: false })),
		).toMatchObject({ create: 'optional', nullable: true })
		expect(
			readFieldTypeState(stringField({ required: true })),
		).toMatchObject({ create: 'required', nullable: false })
	})

	it('rejects required: false beside a generator and a non-boolean required', () => {
		expect(() =>
			// @ts-expect-error -- Rejected by types too.
			intField({ autoIncrement: true, required: false }),
		).toThrow(
			new TypeError(
				'required: false cannot be used with autoIncrement: the database always generates a value',
			),
		)
		expect(() =>
			// @ts-expect-error -- Rejected by types too.
			dateTimeField({ autoNow: true, required: false }),
		).toThrow(
			new TypeError(
				'required: false cannot be used with autoNow: the clock always supplies a value',
			),
		)
		expect(() =>
			// @ts-expect-error -- Rejected by types too.
			booleanField({ default: false, required: 'yes' }),
		).toThrow(new TypeError('required must be a boolean'))
		expect(
			readFieldTypeState(intField({ autoIncrement: true, required: true })),
		).toMatchObject({ create: 'optional', nullable: false })
	})

	it('rejects nullable like any other unknown field option', () => {
		const declare = (): unknown =>
			UltimaBase.Schema.define({
				className: 'RemovedNullableOption',
				fields: (field) => ({
					// @ts-expect-error -- `nullable` is not a field option.
					channel: field.string({ default: 'web', nullable: true }),
				}),
			})

		expect(declare).toThrow(
			new TypeError('Unknown string field option: nullable'),
		)
	})

	it('compiles a defaulted field to a non-null validation plan', () => {
		const Article = UltimaBase.Schema.define({
			className: 'DefaultRequiredPlan',
			fields: (field) => ({
				published: field.boolean({ default: false }),
				channel: field.string({ default: 'web', required: false }),
				address: field.object({
					fields: (embedded) => ({
						city: embedded.string({ default: 'Paris' }),
						zip: embedded.string({ default: '75000', required: false }),
					}),
					default: { city: 'Lyon' },
				}),
			}),
		})
		const { fields } = compileValidationPlans(Article).create

		expect(fields.published).toMatchObject({
			nullable: false,
			presence: 'optional',
		})
		expect(fields.channel).toMatchObject({
			nullable: true,
			presence: 'optional',
		})
		expect(fields.address).toMatchObject({ nullable: false })
		expect(
			readFieldTypeState(
				objectField({
					fields: { city: stringField() },
					default: () => ({ city: null }),
					required: false,
				}),
			),
		).toMatchObject({ nullable: true })
	})
})
