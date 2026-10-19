import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S16 } from './s16.ts'
import { S14 } from './s14.ts'

declare const acl: ACL

export const S15 = App.Schema.declare({
	className: 'S15',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S16, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S14, mappedBy: 'next' }),
		parent: field.pointer({ target: () => S15 }),
	}),
})
