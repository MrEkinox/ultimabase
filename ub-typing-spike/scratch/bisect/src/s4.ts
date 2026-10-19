import type { ACL } from '../../lib2/plugins.ts'
import { App } from './factory.ts'
import { S5 } from './s5.ts'
import { S3 } from './s3.ts'

declare const acl: ACL

export const S4 = App.Schema.declare({
	className: 'S4',
	fields: (field) => ({
		f0: field.string({ required: true }),
		f1: field.int(),
		f2: field.boolean({ required: true, default: false }),
		f3: field.date(),
		f4: field.enum({ values: ['a', 'b', 'c'] }),
		f5: field.string(),
		next: field.pointer({ target: () => S5, onDelete: 'setNull' }),
		prevs: field.relation({ target: () => S3, mappedBy: 'next' }),
	}),
})
