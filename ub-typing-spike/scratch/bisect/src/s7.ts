import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S8 } from './s8.ts'
import { S6 } from './s6.ts'

declare const acl: ACL

export const S7 = App.Schema.declare({
	className: 'S7',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S8, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S6, mappedBy: 'next' }),
	}),
})
