import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S44 } from './s44.ts'
import { S42 } from './s42.ts'

declare const acl: ACL

export const S43 = App.Schema.declare({
	className: 'S43',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S44, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S42, mappedBy: 'next' }),
	}),
})
