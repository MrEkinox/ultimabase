import type {
	ApplicationExposurePlan,
	ApplicationRequestExecutor,
	ExposedWriteMethod,
} from '@ultimabase/core'
import { assertPublicWrites } from '@ultimabase/plugin-kit'
import { immutableArray } from '@ultimabase/shared'

import {
	restClassPath,
	type restProtocol,
	type RestRouteDefinition,
} from './routes.js'
import { restCommandPath } from './schema-mutation-routes.js'
import { restOperationMethods, restRouteTemplates } from './schema-routes.js'

type WriteRoute = Readonly<{
	index: number
	template: (typeof restRouteTemplates)[number]
}>

// Each native write method has exactly one route; reads may have several.
const writeRoutes = new Map<string, WriteRoute>(
	restRouteTemplates.map((template, index) => [
		restOperationMethods[template.operation],
		{ index, template },
	]),
)

/**
 * Refuses to start when REST exposes writes and no protected policy is
 * installed, unless `publicWrites` opts in (ADR-0294). Writes are named in
 * route order: native routes of every schema, then plugin commands.
 */
export const assertRestPublicWrites = (
	plan: ApplicationExposurePlan<typeof restProtocol>,
	basePath: string,
	executor: ApplicationRequestExecutor,
	publicWrites: boolean,
): void => {
	const schemaOrder = plan.schemas.map(({ className }) => className)
	const routeOrder = ({ method, schema }: ExposedWriteMethod): number =>
		method.kind === 'plugin'
			? Number.MAX_SAFE_INTEGER
			: schemaOrder.indexOf(schema) * restRouteTemplates.length +
				(writeRoutes.get(method.entry.method)?.index ?? 0)
	assertPublicWrites({
		describe: ({ method, schema }) => {
			const route = writeRoutes.get(method.entry.method)?.template
			return method.kind === 'plugin' || route === undefined
				? `${schema}.${method.entry.method}`
				: `${route.method} ${restClassPath(basePath, schema)}${route.suffix}`
		},
		hasProtectedPolicy: executor.hasProtectedPolicy(),
		hint: 'restPlugin({ publicWrites: true })',
		label: 'REST',
		publicWrites,
		// A stable sort keeps plugin commands in plan order, after native routes.
		writes: plan.writes.toSorted(
			(left, right) => routeOrder(left) - routeOrder(right),
		),
	})
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
