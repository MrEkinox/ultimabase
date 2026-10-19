import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S19 } from './s19.ts'
import { S17 } from './s17.ts'

declare const acl: ACL

export const S18 = App.Schema.declare({
	className: 'S18',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S19, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S17, mappedBy: 'next' }),
	}),
})
