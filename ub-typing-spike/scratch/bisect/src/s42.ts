import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S43 } from './s43.ts'
import { S41 } from './s41.ts'

declare const acl: ACL

export const S42 = App.Schema.declare({
	className: 'S42',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S43, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S41, mappedBy: 'next' }),
	}),
})
