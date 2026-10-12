import type { ApplicationRequestExecutor } from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'

import { restClassPath, type RestRouteDefinition } from './routes.js'
import { restCommandPath } from './schema-mutation-routes.js'
import { restRouteTemplates } from './schema-routes.js'

// Native routes that write; with plugin commands they need a policy (ADR-0294).
const writeOperations: ReadonlySet<string> = new Set([
	'bulkCreate',
	'bulkDelete',
	'bulkUpdate',
	'bulkUpsert',
	'create',
	'delete',
	'update',
	'upsert',
])

const describeRoute = (route: RestRouteDefinition): string =>
	route.kind === 'rest-schema-mutation-route'
		? `${route.schema}.${route.command}`
		: route.kind === 'rest-schema-route'
			? `${route.method} ${route.path}`
			: route.operation

/**
 * Refuses to start when REST exposes writes and no protected policy is
 * installed, unless `publicWrites` opts in (ADR-0294).
 */
export const assertPublicWrites = (
	routes: readonly RestRouteDefinition[],
	executor: ApplicationRequestExecutor,
	publicWrites: boolean,
): void => {
	if (publicWrites) return
	const writes = routes.filter(
		(route) =>
			route.kind === 'rest-schema-mutation-route' ||
			(route.kind === 'rest-schema-route' &&
				writeOperations.has(route.operation)),
	)
	if (writes.length === 0 || executor.hasProtectedPolicy()) return
	throw new TypeError(
		`REST exposes writes (${writes.slice(0, 3).map(describeRoute).join(', ')}${writes.length > 3 ? ', …' : ''}) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass restPlugin({ publicWrites: true }) to let every client write.`,
	)
}

/** Builds a JSON document once, on the first request that reads it. */
export const lazyDocument = (build: () => unknown): (() => string) => {
	let document: string | undefined
	return () => {
		document ??= JSON.stringify(build())
		return document
	}
}

/**
 * Every route path of each schema REST exposes, enabled or not, and of its
 * exposable commands: a request for a disabled method answers 405, not 404
 * (ADR-0324). A schema without any route stays 404.
 */
export const readKnownPaths = (
	basePath: string,
	routes: readonly RestRouteDefinition[],
	commands: ReadonlyMap<
		string,
		readonly Readonly<{ command: string; schema: string }>[]
	>,
): readonly string[] => {
	const exposed = new Set(
		routes.flatMap((route) =>
			route.kind === 'rest-plugin-operation-route' ? [] : [route.schema],
		),
	)
	return immutableArray(
		[...exposed].flatMap((className) => {
			const classPath = restClassPath(basePath, className)
			return [...new Set(restRouteTemplates.map(({ suffix }) => suffix))]
				.map((suffix) => `${classPath}${suffix}`)
				.concat(
					(commands.get(className) ?? []).map(
						({ command }) => `${classPath}/{id}/${restCommandPath(command)}`,
					),
				)
		}),
	)
}
