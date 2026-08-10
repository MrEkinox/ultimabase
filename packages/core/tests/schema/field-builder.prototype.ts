import { Schema } from '../../src/index.js'

Schema.define({
	className: 'PackedFieldBuilder',
	fields: (field) => ({
		root: field./* completion:root-builder */ string(),
		title: field./* hover:string-builder */ string({
			/* completion:string-options */
		}),
		signatureName: field.string(),
		profile: field.object({
			fields: (field) => ({
				nested: field./* completion:nested-builder */ string(),
			}),
		}),
	}),
})

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
