import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S48 } from './s48.ts'
import { S46 } from './s46.ts'

declare const acl: ACL

export const S47 = App.Schema.declare({
	className: 'S47',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S48, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S46, mappedBy: 'next' }),
	}),
})
