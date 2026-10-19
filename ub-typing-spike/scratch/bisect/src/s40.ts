import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S41 } from './s41.ts'
import { S39 } from './s39.ts'

declare const acl: ACL

export const S40 = App.Schema.declare({
	className: 'S40',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S41, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S39, mappedBy: 'next' }),
		parent: field.pointer({ target: () => S40 }),
	}),
})
