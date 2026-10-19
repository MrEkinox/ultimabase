import type { ACL } from '../../../../../e1-annotated/lib/plugins.ts'
import { App, type Options } from './factory.ts'
import { S21 } from './s21.ts'
import { S19 } from './s19.ts'

declare const acl: ACL

export class S20 extends App.Schema('S20', (field) => ({
	f0: field.string({ required: true }),
	f1: field.int(),
	f2: field.boolean({ required: true, default: false }),
	f3: field.date(),
	f4: field.enum({ values: ['a', 'b', 'c'] }),
	f5: field.string(),
	next: field.pointer({ target: () => S21, onDelete: 'setNull' }),
	prevs: field.relation({ target: () => S19, mappedBy: 'next' }),
	parent: field.pointer({ target: () => S20 }),
})).softDelete() {}
