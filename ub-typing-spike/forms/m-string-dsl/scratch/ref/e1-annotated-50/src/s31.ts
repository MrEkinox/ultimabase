import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S32 } from './s32.ts'
import { S30 } from './s30.ts'

declare const acl: ACL

export class S31 extends App.Schema('S31', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S32, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S30, mappedBy: 'next' }),
})).softDelete() {}
