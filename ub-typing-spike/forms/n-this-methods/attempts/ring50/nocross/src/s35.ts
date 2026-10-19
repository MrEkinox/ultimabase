import type { ACL } from '@ultimabase/core/plugins'
import { App } from './factory.ts'
import { S36 } from './s36.ts'
import { S34 } from './s34.ts'

declare const acl: ACL

export const S35 = App.Schema.define({
	className: 'S35',
	softDelete: true,
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S36, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S34, mappedBy: 'next' }),
		parent: field.pointer({ target: () => S35 }),
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
	postgres: { table: 's35' },
})
