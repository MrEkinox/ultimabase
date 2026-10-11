import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'

import {
	ValidationApplication,
	validateFinalCreate,
} from './field-validation.test-support.js'

// ADR-0319: a Standard Schema validator's output is the stored value.
describe('Standard Schema field transforms', () => {
	it('stores a stripped object output and revalidates an inserted unknown key', async () => {
		const objectValidator = (
			transform: (
				value: Readonly<Record<string, unknown>>,
			) => Readonly<Record<string, unknown>>,
		) =>
			({
				'~standard': {
					version: 1 as const,
					vendor: 'object-transformation-test',
					validate: (value: unknown) =>
						typeof value === 'object' && value !== null
							? { value: transform(value as Readonly<Record<string, unknown>>) }
							: { issues: [{ message: 'Expected object' }] },
				},
			}) as unknown as StandardSchemaV1<
				Readonly<{ name: string; role: string | null }>
			>
		const define = (
			className: string,
			validator: ReturnType<typeof objectValidator>,
		) =>
			ValidationApplication.Schema.define({
				className,
				fields: (field) => ({
					profile: field.object({
						fields: (nested) => ({
							name: nested.string({ required: true }),
							role: nested.string(),
						}),
						validation: validator,
					}),
				}),
			})

		// ADR-0319: the validator output is what gets stored.
		const stripped = await validateFinalCreate(
			define(
				'ObjectTransformationStripping',
				objectValidator((value) => ({ name: value.name })),
			),
			{ profile: { name: 'Ada', role: 'admin' } },
		)
		expect(stripped.input.profile).toStrictEqual({ name: 'Ada' })

		// An output must stay structurally valid: Core checks it again.
		await expect(
			validateFinalCreate(
				define(
					'ObjectTransformationInsertion',
					objectValidator((value) => ({ ...value, inserted: 'default' })),
				),
				{ profile: { name: 'Ada', role: 'admin' } },
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('awaits asynchronous Standard Schema validators and stores their output', async () => {
		const trimming = {
			'~standard': {
				version: 1 as const,
				vendor: 'async-transform-test',
				validate: async (value: unknown) => {
					await Promise.resolve()
					return { value: typeof value === 'string' ? value.trim() : value }
				},
			},
		} as unknown as StandardSchemaV1<string>
		const schema = ValidationApplication.Schema.define({
			className: 'AsyncTrimmedValidation',
			fields: (field) => ({ value: field.string({ validation: trimming }) }),
		})

		const result = await validateFinalCreate(schema, { value: '  padded  ' })
		expect(result.input.value).toBe('padded')
	})
})
