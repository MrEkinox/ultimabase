import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S48 } from './s48.ts'
import { S46 } from './s46.ts'

declare const acl: ACL

export class S47 extends App.Schema('S47', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S48, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S46, mappedBy: 'next' }),
})).softDelete() {}
