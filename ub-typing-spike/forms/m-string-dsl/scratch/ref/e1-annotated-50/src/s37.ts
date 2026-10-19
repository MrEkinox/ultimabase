import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S38 } from './s38.ts'
import { S36 } from './s36.ts'

declare const acl: ACL

export class S37 extends App.Schema('S37', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S38, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S36, mappedBy: 'next' }),
})).softDelete() {}
