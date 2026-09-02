import { Schema, type Pointer } from '@ultimabase/core'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'

const Target = Schema.define({
	className: 'ValidationTypeTarget',
	fields: (field) => ({ name: field.string() }),
})
void Target

test('types scalar, list, object, pointer, and relation validation exactly', () => {
	const scalar = Schema.define({
		className: 'ValidationTypeSubject',
		fields: (field) => ({
			count: field.bigint({ validation: z.bigint() }),
			name: field.string({ validation: z.string().min(1) }),
			tags: field.string({
				list: true,
				validation: z.array(z.string().min(1)),
			}),
			profile: field.object({
				fields: (nested) => ({ label: nested.string({ required: true }) }),
				validation: z.object({ label: z.string() }),
			}),
			owner: field.pointer({
				target: 'ValidationTypeTarget',
				validation: z.custom<Pointer<typeof Target>>(),
			}),
		}),
	})

	expectTypeOf(scalar).toExtend<object>()

	Schema.define({
		className: 'InvalidRelationValidation',
		fields: (field) => ({
			tags: field.relation({
				target: 'ValidationTypeTarget',
				// @ts-expect-error -- Relation handles do not contain field values.
				validation: z.never(),
			}),
		}),
	})
})

test('rejects incompatible and any-based Standard Schema contracts', () => {
	const numberSchema: StandardSchemaV1<number> = {
		'~standard': {
			validate: (value) =>
				typeof value === 'number'
					? { value }
					: { issues: [{ message: 'Expected number' }] },
			vendor: 'fixture',
			version: 1,
		},
	}
	type ParsedJson = ReturnType<typeof JSON.parse>
	const unsafeSchema: StandardSchemaV1<ParsedJson, ParsedJson> = {
		'~standard': {
			validate: (value) => ({ value }),
			vendor: 'fixture',
			version: 1,
		},
	}

	Schema.define({
		className: 'InvalidValidationTypes',
		fields: (field) => ({
			// @ts-expect-error -- A string field cannot use a number validator.
			wrong: field.string({ validation: numberSchema }),
			// @ts-expect-error -- `any` cannot prove an exact field contract.
			unsafe: field.string({ validation: unsafeSchema }),
		}),
	})
})
