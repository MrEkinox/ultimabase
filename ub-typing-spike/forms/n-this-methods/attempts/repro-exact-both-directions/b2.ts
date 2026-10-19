import { App } from './app.ts'
import { B1 } from './b.ts'
export const B2 = App.Schema.define({
	className: 'B2',
	fields: (field) => ({ name: field.string(), owned: field.relation({ target: () => B1, mappedBy: 'owner' }) }),
	access: {
		read() {
			return this.where.some('owned', (todo) => todo.eq('archived', false))
		},
	},
})
