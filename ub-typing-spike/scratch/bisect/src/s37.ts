import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S38 } from './s38.ts'
import { S36 } from './s36.ts'

declare const acl: ACL

export const S37 = App.Schema.declare({
	className: 'S37',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S38, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S36, mappedBy: 'next' }),
	}),
})
