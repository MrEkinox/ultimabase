import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S35 } from './s35.ts'
import { S33 } from './s33.ts'

declare const acl: ACL

export const S34 = App.Schema.declare({
	className: 'S34',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S35, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S33, mappedBy: 'next' }),
	}),
})
