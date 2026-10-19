import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S34 } from './s34.ts'
import { S32 } from './s32.ts'

declare const acl: ACL

export const S33 = App.Schema.declare({
	className: 'S33',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S34, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S32, mappedBy: 'next' }),
	}),
})
