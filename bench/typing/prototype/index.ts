// The prototype's public surface: types only, nothing here runs (Phase 1).
export type { Field, FieldBuilders, Many, One } from './fields.ts'
export type { ServerFunction } from './function.ts'
export { defineFunction } from './function.ts'
export type { App, Model } from './model.ts'
export {
	acl,
	aclPlugin,
	graphql,
	graphqlPlugin,
	memory,
	postgres,
	softDelete,
	softDeletePlugin,
} from './plugin-values.ts'
export type { Caller } from './rules.ts'
export { allow, anyOf } from './rules.ts'
export type { Database } from './ultimabase.ts'
export { defineApp, defineModel } from './ultimabase.ts'
