import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S11 } from './s11.ts'
import { S9 } from './s9.ts'

declare const acl: ACL

export const S10 = App.Schema.declare({
	className: 'S10',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S11, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S9, mappedBy: 'next' }),
		parent: field.pointer({ target: () => S10 }),
	}),
})
