import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S44 } from './s44.ts'
import { S42 } from './s42.ts'

declare const acl: ACL

export class S43 extends App.Schema('S43', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S44, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S42, mappedBy: 'next' }),
})).softDelete() {}
