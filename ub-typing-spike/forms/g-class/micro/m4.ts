import { UltimaBase } from '../lib/core.ts'
import { accessPlugin, softDeletePlugin, postgresPlugin } from '../lib/plugins.ts'
const App = UltimaBase.use(accessPlugin(), softDeletePlugin(), postgresPlugin())
const { field } = App
export class A extends App.Schema('A', { self: field.pointer(() => A) }) {}
export class B extends App.Schema('B', { self: field.pointer(() => B) }, { softDelete: true }) {}
export class C extends App.Schema('C', { self: field.pointer(() => C) }, { postgres: { table: 'c' } }) {}
export class D extends App.Schema('D', { self: field.pointer(() => D), x: field.string() }, { postgres: { indexes: [{ fields: ['x'] }] } }) {}
