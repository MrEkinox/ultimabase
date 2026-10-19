import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S26 } from './s26.ts'
import { S24 } from './s24.ts'

declare const acl: ACL

export class S25 extends App.Schema('S25', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S26, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S24, mappedBy: 'next' }),
	parent: field.pointer({ target: () => S25 }),
})).softDelete() {}
