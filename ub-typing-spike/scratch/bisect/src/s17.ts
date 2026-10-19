import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S18 } from './s18.ts'
import { S16 } from './s16.ts'

declare const acl: ACL

export const S17 = App.Schema.declare({
	className: 'S17',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S18, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S16, mappedBy: 'next' }),
	}),
})
