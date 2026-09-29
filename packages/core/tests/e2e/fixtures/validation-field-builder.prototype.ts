import * as v from 'valibot'
import { z } from 'zod'

import {
	definePluginField,
	type FieldOptions,
	type JsonDocument,
	Pointer,
	type RelationWhereResolver,
	type SchemaReference,
	UltimaBase,
} from '@ultimabase/core'
import { validationPlugin } from '@ultimabase/validation-plugin'

const Application = UltimaBase.use(validationPlugin())

class PackedPluginValue {
	constructor(readonly value: string) {}
}

const PackedTarget = Application.Schema.define({
	className: 'PackedValidatorTarget',
	fields: () => ({}),
})
void PackedTarget

const packedRelationWhere: RelationWhereResolver<
	SchemaReference<'PackedValidatorTarget'>
> = ({ context, where }) => {
	void context.requestId
	return where
}

const zodPluginValidator = z.custom<PackedPluginValue>(
	(value) => value instanceof PackedPluginValue,
)
const valibotPluginValidator = v.custom<PackedPluginValue>(
	(value) => value instanceof PackedPluginValue,
)

definePluginField<
	PackedPluginValue,
	'fixture.zod',
	FieldOptions<PackedPluginValue> & {
		readonly validation: typeof zodPluginValidator
	}
>(
	'fixture.zod',
	{ validation: zodPluginValidator },
	{
		snapshotValue: (value) => {
			if (!(value instanceof PackedPluginValue)) {
				throw new TypeError('Expected a packed plugin value')
			}

			return value
		},
	},
)

definePluginField<
	PackedPluginValue,
	'fixture.valibot',
	FieldOptions<PackedPluginValue> & {
		readonly validation: typeof valibotPluginValidator
	}
>(
	'fixture.valibot',
	{ validation: valibotPluginValidator },
	{
		snapshotValue: (value) => {
			if (!(value instanceof PackedPluginValue)) {
				throw new TypeError('Expected a packed plugin value')
			}

			return value
		},
	},
)

Application.Schema.define({
	className: 'PackedFieldBuilder',
	fields: (field) => ({
		root: field./* completion:root-builder */ string(),
		title: field./* hover:string-builder */ string({
			/* completion:string-options */
		}),
		budget: field.decimal({/* completion:decimal-options */}),
		shapedBudget: field.decimal({
			/* hover:decimal-precision */ precision: 12,
			/* hover:decimal-scale */ scale: 2,
		}),
		requiredTitle: field.string({
			/* hover:field-required */ required: true,
			validation: z.string().min(1),
		}),
		zodList: field.string({
			list: true,
			validation: z.array(z.string().min(1)),
		}),
		valibotList: field.string({
			list: true,
			validation: v.array(v.pipe(v.string(), v.minLength(1))),
		}),
		zodObject: field.object({
			fields: (nested) => ({ label: nested.string({ required: true }) }),
			validation: z.object({ label: z.string().min(1) }),
		}),
		valibotObject: field.object({
			fields: (nested) => ({ label: nested.string({ required: true }) }),
			validation: v.object({
				label: v.pipe(v.string(), v.minLength(1)),
			}),
		}),
		zodTemporal: field.dateTime({ validation: z.iso.datetime() }),
		valibotTemporal: field.dateTime({
			validation: v.pipe(v.string(), v.isoTimestamp()),
		}),
		zodDecimal: field.decimal({
			validation: z.string().regex(/^\d+\.\d{2}$/u),
		}),
		valibotDecimal: field.decimal({
			validation: v.pipe(v.string(), v.regex(/^\d+\.\d{2}$/u)),
		}),
		zodEnum: field.enum({
			validation: z.enum(['draft', 'published']),
			values: ['draft', 'published'],
		}),
		valibotEnum: field.enum({
			validation: v.picklist(['draft', 'published']),
			values: ['draft', 'published'],
		}),
		zodJson: field.json({
			validation: z.custom<JsonDocument>(
				(value) => typeof value === 'object' && value !== null,
			),
		}),
		valibotJson: field.json({
			validation: v.custom<JsonDocument>(
				(value) => typeof value === 'object' && value !== null,
			),
		}),
		zodBinary: field.binary({
			validation: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
		}),
		valibotBinary: field.binary({
			validation: v.custom<Uint8Array>((value) => value instanceof Uint8Array),
		}),
		zodPointer: field.pointer({
			target: 'PackedValidatorTarget',
			validation: z.custom<Pointer<SchemaReference<'PackedValidatorTarget'>>>(
				(value) => value instanceof Pointer,
			),
		}),
		valibotPointer: field.pointer({
			target: 'PackedValidatorTarget',
			validation: v.custom<Pointer<SchemaReference<'PackedValidatorTarget'>>>(
				(value) => value instanceof Pointer,
			),
		}),
		assignee: field.pointer({
			target: 'PackedFieldBuilder',
			onDelete: /* completion:pointer-on-delete */ 'restrict',
		}),
		// @ts-expect-error -- Completion intentionally omits the required target.
		relationOptions: field.relation({/* completion:relation-options */}),
		filteredTargets: field.relation({
			target: 'PackedValidatorTarget',
			where: packedRelationWhere,
		}),
		signatureName: field.string(),
		profile: field.object({
			fields: (field) => ({
				nested: field./* completion:nested-builder */ string(),
			}),
		}),
	}),
})

Application.Schema.define({
	className: 'PackedEmbeddedFieldOptions',
	fields: (field) => ({
		container: field.object({
			fields: (packedEmbedded) => ({
				bigint: packedEmbedded.bigint({
					/* completion:embedded-bigint-options */
				}),
				binary: packedEmbedded.binary({
					/* completion:embedded-binary-options */
				}),
				boolean: packedEmbedded.boolean({
					/* completion:embedded-boolean-options */
				}),
				date: packedEmbedded.date({/* completion:embedded-date-options */}),
				dateTime: packedEmbedded.dateTime({
					/* completion:embedded-date-time-options */
				}),
				decimal: packedEmbedded.decimal({
					/* completion:embedded-decimal-options */
				}),
				// @ts-expect-error -- Completion intentionally omits the required enum domain.
				enum: packedEmbedded.enum({/* completion:embedded-enum-options */}),
				float: packedEmbedded.float({/* completion:embedded-float-options */}),
				int: packedEmbedded.int({/* completion:embedded-int-options */}),
				json: packedEmbedded.json({/* completion:embedded-json-options */}),
				// @ts-expect-error -- Completion intentionally omits the required object fields.
				object: packedEmbedded.object({
					/* completion:embedded-object-options */
				}),
				string: packedEmbedded.string({
					/* completion:embedded-string-options */
				}),
				time: packedEmbedded.time({/* completion:embedded-time-options */}),
				uuid: packedEmbedded.uuid({/* completion:embedded-uuid-options */}),
				// @ts-expect-error -- Portable indexes require a stored root field.
				indexed: packedEmbedded.string({ indexed: true }),
				// @ts-expect-error -- Embedded integers cannot declare a sequence option.
				sequence: packedEmbedded.int({ autoIncrement: false }),
			}),
		}),
	}),
})

// @ts-expect-error -- Packed declarations reject framework system fields.
UltimaBase.Schema.define({
	className: 'PackedReservedSystemField',
	fields: (field) => ({ id: field.string() }),
})

// @ts-expect-error -- Packed declarations reject Query logical keys.
UltimaBase.Schema.define({
	className: 'PackedReservedQueryField',
	fields: (field) => ({ AND: field.string() }),
})

// @ts-expect-error -- Packed declarations reject schema-model capabilities.
UltimaBase.Schema.define({
	className: 'PackedReservedModelField',
	fields: (field) => ({ create: field.string() }),
})
