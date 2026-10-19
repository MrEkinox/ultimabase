import { App } from './app.ts'
// U1: factory, access only
export const U1 = App.PasswordUserSchema.define({
	className: 'U1',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
	access: {
		update() {
			return this.where.eq('displayName', 'x')
		},
	},
})
// U2: plain schema with field hooks
export const U2 = App.Schema.define({
	className: 'U2',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
	hooks: { fields: { displayName: { resolveInput() { return this.value.trim() } } } },
})
// U3: factory with field hooks
export const U3 = App.PasswordUserSchema.define({
	className: 'U3',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
	hooks: { fields: { displayName: { resolveInput() { return this.value.trim() } } } },
})
