import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S9 } from './s9.ts'
import { S7 } from './s7.ts'

declare const acl: ACL

export class S8 extends App.Schema('S8', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S9, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S7, mappedBy: 'next' }),
})).softDelete() {}
