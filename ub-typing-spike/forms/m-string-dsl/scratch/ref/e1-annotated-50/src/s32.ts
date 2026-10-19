import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S33 } from './s33.ts'
import { S31 } from './s31.ts'

declare const acl: ACL

export class S32 extends App.Schema('S32', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S33, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S31, mappedBy: 'next' }),
})).softDelete() {}
