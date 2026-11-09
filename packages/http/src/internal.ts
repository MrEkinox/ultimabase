// What the official transports share (D-139), kept off the documented
// surface: their pages, errors, names and JSON Schema reading.
export type { Args, At, Limits, Page, Relay } from './pages.ts'
export {
	applied,
	endsOf,
	connection,
	countedPage,
	pageArgs,
	pageOf,
	readsNoRow,
	rowOf,
	rowsOf,
} from './pages.ts'
export { Backlog } from './backlog.ts'
export type { Node, ServedOneOf } from './transport.ts'
export {
	badInput,
	backOf,
	declared,
	isNode,
	jsonSchemaOf,
	oneOfsOf,
	plural,
	readable,
	readableOneOfs,
	readableVirtuals,
	run,
} from './transport.ts'
