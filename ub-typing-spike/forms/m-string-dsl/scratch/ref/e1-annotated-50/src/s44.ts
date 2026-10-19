import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S45 } from './s45.ts'
import { S43 } from './s43.ts'

declare const acl: ACL

export class S44 extends App.Schema('S44', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S45, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S43, mappedBy: 'next' }),
})).softDelete() {}
