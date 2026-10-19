import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S0 } from './s0.ts'
import { S48 } from './s48.ts'

declare const acl: ACL

export const S49 = App.Schema.declare({
	className: 'S49',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S0, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S48, mappedBy: 'next' }),
	}),
})
