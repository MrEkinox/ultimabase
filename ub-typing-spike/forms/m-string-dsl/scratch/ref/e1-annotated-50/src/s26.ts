import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S27 } from './s27.ts'
import { S25 } from './s25.ts'

declare const acl: ACL

export class S26 extends App.Schema('S26', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S27, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S25, mappedBy: 'next' }),
})).softDelete() {}
