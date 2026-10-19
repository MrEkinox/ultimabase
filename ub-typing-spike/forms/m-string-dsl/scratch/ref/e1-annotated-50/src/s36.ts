import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S37 } from './s37.ts'
import { S35 } from './s35.ts'

declare const acl: ACL

export class S36 extends App.Schema('S36', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S37, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S35, mappedBy: 'next' }),
})).softDelete() {}
