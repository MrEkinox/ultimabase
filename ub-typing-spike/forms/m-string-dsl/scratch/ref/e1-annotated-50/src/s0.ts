import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S1 } from './s1.ts'
import { S49 } from './s49.ts'

declare const acl: ACL

export class S0 extends App.Schema('S0', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S1, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S49, mappedBy: 'next' }),
	parent: field.pointer({ target: () => S0 }),
})).softDelete() {}
