import { describe, expect, it } from 'vitest'

import {
	Pointer,
	Schema,
	SchemaRegistry,
	pointerField,
	snapshotScalarFieldValue,
} from '../../index.js'

const userSchema = Schema.define({ className: 'PointerFieldUser', fields: {} })

describe('pointerField', () => {
	it('keeps its lazy target private and normalizes the safe delete policy', () => {
		const target = (): typeof userSchema => userSchema
		const field = pointerField({ target })
		const source = Schema.define({
			className: 'PointerFieldPost',
			fields: { author: field },
		})
		const graph = new SchemaRegistry([
			source,
			userSchema,
		]).resolveSchemaTargets()

		expect(field).toStrictEqual({
			kind: 'pointer',
			options: { onDelete: 'restrict' },
		})
		expect(field.options).not.toHaveProperty('target')
		expect(graph.get(source, ['author'])).toBe(userSchema)
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('copies common metadata and preserves pointer snapshots', () => {
		const validation = { nullable: true }
		const field = pointerField({
			target: () => userSchema,
			validation,
			onDelete: 'setNull',
			indexed: 'unique',
			immutable: true,
			description: 'Post author',
		})
		const pointer = userSchema.pointer('user-1')

		validation.nullable = false

		expect(field.options).toStrictEqual({
			validation: { nullable: true },
			onDelete: 'setNull',
			indexed: 'unique',
			immutable: true,
			description: 'Post author',
		})
		expect(field.options.validation?.nullable).toBe(true)
		expect(snapshotScalarFieldValue(field, pointer, 'input.author')).toBe(
			pointer,
		)
		expect(() =>
			snapshotScalarFieldValue(
				field,
				new Pointer(
					Schema.define({ className: 'WrongPointerTarget', fields: {} }),
					'user-1',
				),
				'input.author',
			),
		).toThrow(new TypeError('input.author must point to PointerFieldUser'))
	})

	it.each([
		{
			expected: 'pointerField does not support list values',
			options: { target: () => userSchema, list: true },
		},
		{
			expected: 'onDelete must be "restrict", "cascade", or "setNull"',
			options: { target: () => userSchema, onDelete: 'detach' },
		},
		{
			expected: 'onDelete "setNull" requires validation.nullable to be true',
			options: { target: () => userSchema, onDelete: 'setNull' },
		},
	])('rejects invalid metadata: $expected', ({ expected, options }) => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			pointerField(options)
		}).toThrow(new TypeError(expected))
	})

	it('rejects defaults and contradictory presence metadata at runtime', () => {
		expect(() => {
			pointerField({
				target: () => userSchema,
				// @ts-expect-error -- Pointer identity must always be explicit.
				default: userSchema.pointer('user-1'),
			})
		}).toThrow(new TypeError('pointerField does not support default values'))

		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			pointerField({
				target: () => userSchema,
				validation: {
					required: true,
					nullable: true,
				},
			})
		}).toThrow(
			new TypeError(
				'validation.required and validation.nullable cannot both be true',
			),
		)
	})

	it('rejects malformed lazy targets when a value crosses the field', () => {
		const field = pointerField({
			// @ts-expect-error -- Runtime snapshots protect JavaScript callers.
			target: (): string => 'not-a-schema',
		})

		expect(() =>
			snapshotScalarFieldValue(
				field,
				userSchema.pointer('user-1'),
				'input.author',
			),
		).toThrow(
			new TypeError('input.author target must be created by Schema.define'),
		)
	})
})
