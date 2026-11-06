// The smallest hook: it changes a value before it is written.
//#region tag
import { allow, defineModel } from 'ultimabase'

export const Tag = defineModel({
	name: 'Tag',
	fields: (f) => ({ label: f.string() }),
}).with({
	access: allow.public,
	hooks: {
		// Changes `data` before it is written.
		beforeCreate: ({ data }) => {
			data.label = data.label.trim().toLowerCase()
		},
	},
})
//#endregion
