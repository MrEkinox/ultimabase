import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S28 } from './s28.ts'
import { S26 } from './s26.ts'

declare const acl: ACL

export class S27 extends App.Schema('S27', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S28, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S26, mappedBy: 'next' }),
})).softDelete() {}
