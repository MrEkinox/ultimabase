import type { CompiledCommandGraph } from './command-graph.js'

const graphs = new WeakMap<object, CompiledCommandGraph>()

/** Installs the statically compiled graph only after complete schema publication. */
export const bindApplicationCommandGraph = (
	application: object,
	graph: CompiledCommandGraph,
): void => {
	if (graphs.has(application))
		throw new TypeError('Application command graph is already bound')
	graphs.set(application, graph)
}

/** Core-only access never exposes a graph dictionary through plugin capabilities. */
export const readApplicationCommandGraph = (
	application: object,
): CompiledCommandGraph => {
	const graph = graphs.get(application)
	if (graph === undefined)
		throw new TypeError('Application commands have not been compiled')
	return graph
}
