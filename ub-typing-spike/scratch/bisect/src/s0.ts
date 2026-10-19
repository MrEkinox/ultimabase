import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S1 } from './s1.ts'
import { S49 } from './s49.ts'

declare const acl: ACL

export const S0 = App.Schema.declare({
	className: 'S0',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S1, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S49, mappedBy: 'next' }),
		parent: field.pointer({ target: () => S0 }),
	}),
})
