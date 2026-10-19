import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S17 } from './s17.ts'
import { S15 } from './s15.ts'

declare const acl: ACL

export const S16 = App.Schema.declare({
	className: 'S16',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S17, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S15, mappedBy: 'next' }),
	}),
})
