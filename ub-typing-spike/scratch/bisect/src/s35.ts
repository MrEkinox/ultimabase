import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S36 } from './s36.ts'
import { S34 } from './s34.ts'

declare const acl: ACL

export const S35 = App.Schema.declare({
	className: 'S35',
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
})
