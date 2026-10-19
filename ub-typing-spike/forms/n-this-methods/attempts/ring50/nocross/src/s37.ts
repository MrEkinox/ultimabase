import type { ACL } from '@ultimabase/core/plugins'
import { App } from './factory.ts'
import { S38 } from './s38.ts'
import { S36 } from './s36.ts'

declare const acl: ACL

export const S37 = App.Schema.define({
	className: 'S37',
	softDelete: true,
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S38, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S36, mappedBy: 'next' }),
	}),
	access: {
		read() {
			return this.where.eq('f2', false)
		},
		create: true,
	},
	hooks: {
		beforeSave() {
			if (this.item.f0.length === 0) throw new TypeError('f0')
		},
	},
	acl: {
		default() {
			return this.data.f0 === '' ? acl : acl.grantPublic('read')
		},
	},
	postgres: { table: 's37' },
})
