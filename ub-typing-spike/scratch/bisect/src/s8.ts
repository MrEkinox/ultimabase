import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S9 } from './s9.ts'
import { S7 } from './s7.ts'

declare const acl: ACL

export const S8 = App.Schema.declare({
	className: 'S8',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S9, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S7, mappedBy: 'next' }),
	}),
})
