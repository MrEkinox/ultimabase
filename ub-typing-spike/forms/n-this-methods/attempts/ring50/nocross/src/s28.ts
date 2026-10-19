import type { ACL } from '@ultimabase/core/plugins'
import { App } from './factory.ts'
import { S29 } from './s29.ts'
import { S27 } from './s27.ts'

declare const acl: ACL

export const S28 = App.Schema.define({
	className: 'S28',
	softDelete: true,
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S29, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S27, mappedBy: 'next' }),
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
	postgres: { table: 's28' },
})
