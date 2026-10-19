import type { FieldBuilder, SchemaClass, CompleteFields, SchemaOptionsFor } from '../../lib/core.ts'
import { accessPlugin, hooksPlugin } from '../../lib/plugins.ts'
import { UltimaBase } from '../../lib/core.ts'
const App = UltimaBase.use(accessPlugin()).use(hooksPlugin())
type H = typeof App extends import('../../lib/core.ts').ConfiguredFactory<infer X, unknown> ? X : never
// 1: intersection without NoInfer
declare const define1: <const N extends string, const F>(d: { readonly className: N; readonly fields: (field: FieldBuilder) => F } & SchemaOptionsFor<H, SchemaClass<N, CompleteFields<F, {}>>>) => SchemaClass<N, CompleteFields<F, {}>>
export const S1 = define1({ className: 'S1', fields: (field) => ({ title: field.string({ required: true }) }), access: { read: { where: ({ where }) => where.eq('title', 'x') } }, hooks: { beforeSave: ({ item }) => { item.title.trim() } } })
// 2: non-context-sensitive fields (object instead of callback)
declare const field: FieldBuilder
declare const define2: <const N extends string, const F>(d: { readonly className: N; readonly fields: F } & NoInfer<SchemaOptionsFor<H, SchemaClass<N, CompleteFields<F, {}>>>>) => SchemaClass<N, CompleteFields<F, {}>>
export const S2 = define2({ className: 'S2', fields: { title: field.string({ required: true }) }, access: { read: { where: ({ where }) => where.eq('title', 'x') } }, hooks: { beforeSave: ({ item }) => { item.title.trim() } } })
// 3: callback fields, NoInfer (current A)
declare const define3: <const N extends string, const F>(d: { readonly className: N; readonly fields: (field: FieldBuilder) => F } & NoInfer<SchemaOptionsFor<H, SchemaClass<N, CompleteFields<F, {}>>>>) => SchemaClass<N, CompleteFields<F, {}>>
export const S3 = define3({ className: 'S3', fields: (field) => ({ title: field.string({ required: true }) }), access: { read: { where: ({ where }) => where.eq('title', 'x') } }, hooks: { beforeSave: ({ item }) => { item.title.trim() } } })
// 4: fields as method shorthand / annotated param (not context sensitive)
export const S4 = define3({ className: 'S4', fields: (field: FieldBuilder) => ({ title: field.string({ required: true }) }), access: { read: { where: ({ where }) => where.eq('title', 'x') } }, hooks: { beforeSave: ({ item }) => { item.title.trim() } } })
