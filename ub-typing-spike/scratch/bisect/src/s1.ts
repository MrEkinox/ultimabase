import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S2 } from './s2.ts'
import { S0 } from './s0.ts'

declare const acl: ACL

export const S1 = App.Schema.declare({
	className: 'S1',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S2, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S0, mappedBy: 'next' }),
	}),
})
