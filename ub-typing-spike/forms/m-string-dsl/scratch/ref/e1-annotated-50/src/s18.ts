import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S19 } from './s19.ts'
import { S17 } from './s17.ts'

declare const acl: ACL

export class S18 extends App.Schema('S18', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S19, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S17, mappedBy: 'next' }),
})).softDelete() {}
