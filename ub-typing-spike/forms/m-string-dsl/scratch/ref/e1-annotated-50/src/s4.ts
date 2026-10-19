import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S5 } from './s5.ts'
import { S3 } from './s3.ts'

declare const acl: ACL

export class S4 extends App.Schema('S4', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S5, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S3, mappedBy: 'next' }),
})).softDelete() {}
