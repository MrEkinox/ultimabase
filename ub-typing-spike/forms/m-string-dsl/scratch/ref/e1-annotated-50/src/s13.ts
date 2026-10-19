import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S14 } from './s14.ts'
import { S12 } from './s12.ts'

declare const acl: ACL

export class S13 extends App.Schema('S13', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S14, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S12, mappedBy: 'next' }),
})).softDelete() {}
