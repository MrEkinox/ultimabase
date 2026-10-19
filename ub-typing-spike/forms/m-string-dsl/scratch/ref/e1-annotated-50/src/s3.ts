import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S4 } from './s4.ts'
import { S2 } from './s2.ts'

declare const acl: ACL

export class S3 extends App.Schema('S3', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S4, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S2, mappedBy: 'next' }),
})).softDelete() {}
