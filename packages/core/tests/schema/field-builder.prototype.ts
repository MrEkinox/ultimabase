import { Schema } from '../../src/index.js'

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
			scale: 2,
		}),
		legacyBudget: field.decimal({
			validation: {
				// @ts-expect-error -- Packed declarations reject nested decimal shape.
				precision: 12,
			},
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
