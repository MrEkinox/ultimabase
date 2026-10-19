import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S47 } from './s47.ts'
import { S45 } from './s45.ts'

declare const acl: ACL

export class S46 extends App.Schema('S46', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S47, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S45, mappedBy: 'next' }),
})).softDelete() {}
