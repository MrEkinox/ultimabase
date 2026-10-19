// The prototype's public surface: types only, nothing here runs (Phase 1).
export type { Field, Many, One } from './fields.ts'
export {
	boolean,
	date,
	enumOf,
	json,
	many,
	number,
	one,
	string,
} from './fields.ts'
export type { App, Model } from './model.ts'
export { createApp, defineModel } from './model.ts'
export type { Register } from './register.ts'
export type { Caller } from './rules.ts'
export { allow, anyOf } from './rules.ts'
