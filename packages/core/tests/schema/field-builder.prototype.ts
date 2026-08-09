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
