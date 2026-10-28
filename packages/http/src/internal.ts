// What the official transports share (D-139), kept off the documented
// surface: their pages, errors, names and JSON Schema reading.
export type { Args, At, Limits, Page, Pagination, Relay } from './pages.ts'
export { connection, pageArgs, pageOf, rowOf, rowsOf } from './pages.ts'
export type { Node, Served } from './transport.ts'
export {
	badInput,
	isNode,
	jsonSchemaOf,
	plural,
	readable,
	readableVirtuals,
	run,
} from './transport.ts'
