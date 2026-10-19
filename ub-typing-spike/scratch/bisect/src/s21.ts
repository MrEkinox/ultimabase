import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S22 } from './s22.ts'
import { S20 } from './s20.ts'

declare const acl: ACL

export const S21 = App.Schema.declare({
	className: 'S21',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S22, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S20, mappedBy: 'next' }),
	}),
})
