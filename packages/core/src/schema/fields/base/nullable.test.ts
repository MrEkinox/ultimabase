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

// ADR-0340: a default makes a stored field non-null unless it declares
// `nullable: true`, which exists only beside a default.
describe('default nullability', () => {
	it('derives non-null state from a default and nullable state from the opt-in', () => {
		expect(readFieldTypeState(booleanField({ default: false }))).toStrictEqual({
			create: 'optional',
			list: false,
			nullable: false,
			object: 'required',
			update: 'optional',
		})
		expect(
			readFieldTypeState(
				enumField({ values: ['a', 'b'], default: 'a', nullable: true }),
			),
		).toMatchObject({ create: 'optional', nullable: true })
		expect(
			readFieldTypeState(intField({ default: 0, nullable: false })),
		).toMatchObject({ nullable: false })
		expect(readFieldTypeState(stringField())).toMatchObject({ nullable: true })
	})

	it('rejects nullable without a default, beside required or beside a generator', () => {
		// @ts-expect-error -- Rejected by types too.
		expect(() => stringField({ nullable: true })).toThrow(
			new TypeError('nullable is only accepted beside a default'),
		)
		expect(() =>
			// @ts-expect-error -- Rejected by types too.
			stringField({ default: 'x', nullable: true, required: true }),
		).toThrow(new TypeError('required and nullable cannot both be true'))
		expect(() =>
			// @ts-expect-error -- Rejected by types too.
			intField({ autoIncrement: true, default: 1, nullable: true }),
		).toThrow(new TypeError('autoIncrement and nullable cannot both be true'))
		expect(() =>
			// @ts-expect-error -- Rejected by types too.
			dateTimeField({ autoNow: true, nullable: true }),
		).toThrow(new TypeError('nullable is only accepted beside a default'))
		expect(() =>
			// @ts-expect-error -- Rejected by types too.
			booleanField({ default: false, nullable: 'yes' }),
		).toThrow(new TypeError('nullable must be a boolean'))
	})

	it('compiles a defaulted field to a non-null validation plan', () => {
		const Article = UltimaBase.Schema.define({
			className: 'DefaultNullabilityPlan',
			fields: (field) => ({
				published: field.boolean({ default: false }),
				channel: field.string({ default: 'web', nullable: true }),
				address: field.object({
					fields: (embedded) => ({
						city: embedded.string({ default: 'Paris' }),
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
					nullable: true,
				}),
			),
		).toMatchObject({ nullable: true })
	})
})
