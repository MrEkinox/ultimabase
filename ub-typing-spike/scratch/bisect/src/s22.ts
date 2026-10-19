import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S23 } from './s23.ts'
import { S21 } from './s21.ts'

declare const acl: ACL

export const S22 = App.Schema.declare({
	className: 'S22',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S23, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S21, mappedBy: 'next' }),
	}),
})
