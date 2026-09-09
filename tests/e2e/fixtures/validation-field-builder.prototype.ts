import * as v from 'valibot'
import { z } from 'zod'

import {
	definePluginField,
	type EmbeddedFieldBuilder,
	type FieldOptions,
	type JsonDocument,
	objectField,
	Pointer,
	Schema,
	stringField,
} from '@ultimabase/core'

class PackedPluginValue {
	constructor(readonly value: string) {}
}

const PackedTarget = Schema.define({
	className: 'PackedValidatorTarget',
	fields: () => ({}),
})
void PackedTarget

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

const zodObjectField = objectField({
	fields: { label: stringField({ required: true }) },
	validation: z.object({ label: z.string().min(1) }),
})
const valibotObjectField = objectField({
	fields: { label: stringField({ required: true }) },
	validation: v.object({
		label: v.pipe(v.string(), v.minLength(1)),
	}),
})

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

Schema.define({
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
		zodObject: zodObjectField,
		valibotObject: valibotObjectField,
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
			validation: z.custom<Pointer<typeof PackedTarget>>(
				(value) => value instanceof Pointer,
			),
		}),
		valibotPointer: field.pointer({
			target: 'PackedValidatorTarget',
			validation: v.custom<Pointer<typeof PackedTarget>>(
				(value) => value instanceof Pointer,
			),
		}),
		assignee: field.pointer({
			target: 'PackedFieldBuilder',
			onDelete: /* completion:pointer-on-delete */ 'restrict',
		}),
		signatureName: field.string(),
		profile: field.object({
			fields: (field) => ({
				nested: field./* completion:nested-builder */ string(),
			}),
		}),
	}),
})

declare const packedEmbedded: EmbeddedFieldBuilder

packedEmbedded.bigint({/* completion:embedded-bigint-options */})
packedEmbedded.binary({/* completion:embedded-binary-options */})
packedEmbedded.boolean({/* completion:embedded-boolean-options */})
packedEmbedded.date({/* completion:embedded-date-options */})
packedEmbedded.dateTime({/* completion:embedded-date-time-options */})
packedEmbedded.decimal({/* completion:embedded-decimal-options */})
// @ts-expect-error -- Completion intentionally omits the required enum domain.
packedEmbedded.enum({/* completion:embedded-enum-options */})
packedEmbedded.float({/* completion:embedded-float-options */})
packedEmbedded.int({/* completion:embedded-int-options */})
packedEmbedded.json({/* completion:embedded-json-options */})
// @ts-expect-error -- Completion intentionally omits the required object fields.
packedEmbedded.object({/* completion:embedded-object-options */})
packedEmbedded.string({/* completion:embedded-string-options */})
packedEmbedded.time({/* completion:embedded-time-options */})
packedEmbedded.uuid({/* completion:embedded-uuid-options */})

// @ts-expect-error -- Portable indexes require a stored root field.
packedEmbedded.string({ indexed: true })
// @ts-expect-error -- Embedded integers cannot declare a sequence option.
packedEmbedded.int({ autoIncrement: false })

// @ts-expect-error -- Packed declarations reject framework system fields.
Schema.define({
	className: 'PackedReservedSystemField',
	fields: (field) => ({ id: field.string() }),
})

// @ts-expect-error -- Packed declarations reject Query logical keys.
Schema.define({
	className: 'PackedReservedQueryField',
	fields: (field) => ({ AND: field.string() }),
})

// @ts-expect-error -- Packed declarations reject schema-model capabilities.
Schema.define({
	className: 'PackedReservedModelField',
	fields: (field) => ({ create: field.string() }),
})
