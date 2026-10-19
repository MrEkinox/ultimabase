import { App } from './app.ts'
// 1: fields only
export const A1 = App.Schema.define({ className: 'A1', fields: (field) => ({ title: field.string(), archived: field.boolean() }) })
// 2: one access method
export const A2 = App.Schema.define({
	className: 'A2',
	fields: (field) => ({ title: field.string(), archived: field.boolean() }),
	access: {
		read() {
			return this.where.eq('archived', false)
		},
	},
})
// 3: softDelete + hook
export const A3 = App.Schema.define({
	className: 'A3',
	softDelete: true,
	fields: (field) => ({ title: field.string(), archived: field.boolean() }),
	hooks: {
		beforeUpdate() {
			if (this.item.isDeleted) throw new TypeError('deleted')
		},
	},
})
type Check<T extends true> = T
export type C1 = Check<typeof A2['~fields'] extends { archived: unknown } ? true : false>
