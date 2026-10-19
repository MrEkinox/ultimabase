import type { SchemaOptionsHKT, SchemaView, EmptyOptionsHKT, SchemaOptionsFor, ConfigurableSchemaClass, CompleteFields } from '../../lib/core.ts'
import type { AccessSchemaOption } from '../../lib/plugins.ts'
import type { ScalarField } from '../../lib/types.ts'
interface AccessHKT extends SchemaOptionsHKT { readonly options: AccessSchemaOption<this['schema']> }
type V = SchemaView<'X', { readonly name: ScalarField<'string', string, true> }>
type Applied = SchemaOptionsFor<EmptyOptionsHKT & AccessHKT, V>
export const x: Applied = { access: { read: { where: ({ where }) => where.eq('name', 'a') } } }
type F = CompleteFields<{ readonly name: ScalarField<'string', string, true> }, {}>
declare const c: ConfigurableSchemaClass<'X', F, EmptyOptionsHKT & AccessHKT>
export const z = c.with({})
