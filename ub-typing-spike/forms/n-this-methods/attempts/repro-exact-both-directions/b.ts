import { App } from './app.ts'
import { B2 } from './b2.ts'
// cross-schema pointer, fields only + local filter
export const B1 = App.Schema.define({
	className: 'B1',
	fields: (field) => ({ title: field.string(), archived: field.boolean(), owner: field.pointer({ target: () => B2 }) }),
	access: {
		read() {
			return this.where.eq('archived', false)
		},
		update() {
			return this.where.is('owner', (owner) => owner.eq('name', 'x'))
		},
	},
})
type Check<T extends true> = T
export type C1 = Check<typeof B1['~fields'] extends { archived: unknown } ? true : false>
