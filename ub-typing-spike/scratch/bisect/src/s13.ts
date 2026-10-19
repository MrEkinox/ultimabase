import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S14 } from './s14.ts'
import { S12 } from './s12.ts'

declare const acl: ACL

export const S13 = App.Schema.declare({
	className: 'S13',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S14, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S12, mappedBy: 'next' }),
	}),
})
