import type { SchemaOptionsHKT, SchemaView } from '../../lib/core.ts'
import type { AccessSchemaOption } from '../../lib/plugins.ts'
import type { ScalarField } from '../../lib/types.ts'
interface AccessHKT extends SchemaOptionsHKT { readonly options: AccessSchemaOption<this['schema']> }
type V = SchemaView<'X', { readonly name: ScalarField<'string', string, true> }>
type Applied = (AccessHKT & { readonly schema: V })['options']
export const x: Applied = { access: { read: { where: ({ where }) => where.eq('name', 'a') } } }
type Applied2 = AccessSchemaOption<V>
export const y: Applied2 = { access: { read: { where: ({ where }) => where.eq('name', 'a') } } }
