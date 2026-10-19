import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S16 } from './s16.ts'
import { S14 } from './s14.ts'

declare const acl: ACL

export class S15 extends App.Schema('S15', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S16, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S14, mappedBy: 'next' }),
	parent: field.pointer({ target: () => S15 }),
})).softDelete() {}
