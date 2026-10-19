import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S6 } from './s6.ts'
import { S4 } from './s4.ts'

declare const acl: ACL

export const S5 = App.Schema.declare({
	className: 'S5',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S6, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S4, mappedBy: 'next' }),
		parent: field.pointer({ target: () => S5 }),
	}),
})
