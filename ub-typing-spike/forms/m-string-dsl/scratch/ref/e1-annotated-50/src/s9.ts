import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S10 } from './s10.ts'
import { S8 } from './s8.ts'

declare const acl: ACL

export class S9 extends App.Schema('S9', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S10, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S8, mappedBy: 'next' }),
})).softDelete() {}
