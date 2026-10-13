import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { HttpApplication, HttpApplicationSettings } from './application.js'
import {
	httpApplicationIdHeader,
	httpBrowserBootstrapPathPrefix,
} from './constants.js'
import { isHttpHealthRoute } from './health.js'
import {
	httpPreDispatchErrorCodes,
	readPreparedHeader,
	rebuildHttpRequest,
	type HttpPreDispatchErrorCode,
	type PreparedHttpServerRequest,
} from './request-boundary.js'
import { selectHttpEndpoint } from './route-graph.js'

// Reads `/__ultimabase/apps/{encoded appId}{routePath}` from one GET request.
const readBrowserBootstrapSelection = (
	request: Request,
): Readonly<{ appId: string; routePath: string }> | undefined => {
	if (request.method !== 'GET') return undefined
	const pathname = new URL(request.url).pathname
	const prefix = `${httpBrowserBootstrapPathPrefix}/`
	if (!pathname.startsWith(prefix)) return undefined

	const remainder = pathname.slice(prefix.length)
	const separator = remainder.indexOf('/')
	if (separator < 1) return undefined

	let appId: string
	try {
		appId = decodeURIComponent(remainder.slice(0, separator))
	} catch {
		return undefined
	}
	if (appId.length === 0) return undefined
	return { appId, routePath: remainder.slice(separator) }
}

// Rewrites an owned browser bootstrap into an ordinary identified request.
const rewriteBrowserBootstrap = (
	prepared: PreparedHttpServerRequest,
	selection: Readonly<{ appId: string; routePath: string }>,
): PreparedHttpServerRequest => {
	const source = prepared.input.request
	const originalHeaders = immutableArray([
		...prepared.originalHeaders,
		immutableArray([httpApplicationIdHeader, selection.appId] as const),
	])
	const url = new URL(source.url)
	url.pathname = selection.routePath
	const headers = new Headers(source.headers)
	headers.set(httpApplicationIdHeader, selection.appId)
	const request = rebuildHttpRequest(source, url, headers, source.signal, null)
	return immutableRecord({
		input: immutableRecord({
			originalHeaders,
			remoteAddress: prepared.remoteAddress,
			request,
		}),
		originalHeaders,
		remoteAddress: prepared.remoteAddress,
		requestId: prepared.requestId,
	})
}

/**
 * @internal Accepts the request for this application (ADR-0323): a matching header, no
 * header at all unless `requireApplicationId` (the built-in health route
 * excepted, ADR-0303), or path identity only for an exact owned browser
 * bootstrap. An explicit header never falls back to the path, even when
 * empty, and a different one is an unknown application.
 */
export const acceptHttpApplicationRequest = (
	application: HttpApplication,
	settings: Pick<
		HttpApplicationSettings,
		'healthPath' | 'requireApplicationId'
	>,
	prepared: PreparedHttpServerRequest,
): PreparedHttpServerRequest | HttpPreDispatchErrorCode => {
	const appId = readPreparedHeader(
		prepared.originalHeaders,
		httpApplicationIdHeader,
	)
	if (appId !== undefined) {
		return appId === application.appId
			? prepared
			: httpPreDispatchErrorCodes.applicationUnknown
	}
	const selection = readBrowserBootstrapSelection(prepared.input.request)
	if (
		selection?.appId === application.appId &&
		application.routeGraph.browserBootstraps.some(
			(route) => route.path === selection.routePath,
		)
	) {
		return rewriteBrowserBootstrap(prepared, selection)
	}
	if (!settings.requireApplicationId) return prepared
	// Load balancers and probes send no application header (ADR-0303).
	const endpoint = selectHttpEndpoint(
		application.routeGraph,
		prepared.input.request,
	)
	return endpoint !== undefined &&
		isHttpHealthRoute(endpoint, settings.healthPath)
		? prepared
		: httpPreDispatchErrorCodes.applicationRejected
}

/**
 * @internal Network requests carry headers; a request with headers but no
 * captured originals reached the network path without its evidence.
 */
export const lacksNetworkHeaders = (
	prepared: PreparedHttpServerRequest,
): boolean =>
	prepared.originalHeaders.length === 0 &&
	[...prepared.input.request.headers.keys()].length > 0
