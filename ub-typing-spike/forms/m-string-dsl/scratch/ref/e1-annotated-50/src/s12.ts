import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S13 } from './s13.ts'
import { S11 } from './s11.ts'

declare const acl: ACL

export class S12 extends App.Schema('S12', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S13, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S11, mappedBy: 'next' }),
})).softDelete() {}
