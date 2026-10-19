import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S49 } from './s49.ts'
import { S47 } from './s47.ts'

declare const acl: ACL

export const S48 = App.Schema.declare({
	className: 'S48',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S49, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S47, mappedBy: 'next' }),
	}),
})
