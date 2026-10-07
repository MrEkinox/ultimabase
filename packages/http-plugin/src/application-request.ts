import { immutableArray, immutableRecord } from '@ultimabase/shared'
import type { HttpApplication } from './application.js'
import {
	httpApplicationIdHeader,
	httpBrowserBootstrapPathPrefix,
} from './constants.js'
import {
	HttpPreDispatchFailure,
	httpPreDispatchErrorCodes,
	readPreparedApplicationId,
	readPreparedHeader,
	type PreparedHttpServerRequest,
} from './request-boundary.js'

interface HttpBrowserBootstrapSelection {
	readonly appId: string
	readonly routePath: string
}

const readBrowserBootstrapSelection = (
	prepared: PreparedHttpServerRequest,
): HttpBrowserBootstrapSelection | undefined => {
	if (
		prepared.input.request.method !== 'GET' ||
		readPreparedHeader(prepared.originalHeaders, httpApplicationIdHeader) !==
			undefined
	) {
		return undefined
	}
	const pathname = new URL(prepared.input.request.url).pathname
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

const rewriteBrowserBootstrapRequest = (
	prepared: PreparedHttpServerRequest,
	selection: HttpBrowserBootstrapSelection,
): PreparedHttpServerRequest => {
	const originalHeaders = immutableArray([
		...prepared.originalHeaders,
		immutableArray([httpApplicationIdHeader, selection.appId] as const),
	])
	const source = prepared.input.request
	const url = new URL(source.url)
	url.pathname = selection.routePath
	const headers = new Headers(source.headers)
	headers.set(httpApplicationIdHeader, selection.appId)
	const request = new Request(url, {
		cache: source.cache,
		credentials: source.credentials,
		headers,
		integrity: source.integrity,
		keepalive: source.keepalive,
		method: source.method,
		mode: source.mode,
		redirect: source.redirect,
		referrer: source.referrer,
		referrerPolicy: source.referrerPolicy,
		signal: source.signal,
	})
	return immutableRecord({
		input: immutableRecord({ originalHeaders, request }),
		originalHeaders,
		requestId: prepared.requestId,
	})
}

/** @internal Accepts path identity only for an exact owned browser bootstrap. */
export const prepareHttpApplicationRequest = (
	application: HttpApplication,
	prepared: PreparedHttpServerRequest,
): PreparedHttpServerRequest => {
	try {
		if (readPreparedApplicationId(prepared) === application.appId)
			return prepared
	} catch {
		const selection = readBrowserBootstrapSelection(prepared)
		if (
			selection?.appId === application.appId &&
			application.routeGraph.browserBootstraps.some(
				(route) => route.path === selection.routePath,
			)
		)
			return rewriteBrowserBootstrapRequest(prepared, selection)
	}
	throw new HttpPreDispatchFailure(
		httpPreDispatchErrorCodes.applicationRejected,
	)
}
