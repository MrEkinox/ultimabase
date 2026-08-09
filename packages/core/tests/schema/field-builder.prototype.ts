import { Schema } from '../../src/index.js'

Schema.define({
	className: 'PackedFieldBuilder',
	fields(field) {
		field./* completion:root-builder */ string('root')
		field./* hover:string-builder */ string('title', {
			/* completion:string-options */
		})
		field.string(/* signature:string-name */ 'signatureName')
		field.object('profile', {
			fields(field) {
				field./* completion:nested-builder */ string('nested')
			},
		})
	},
})
