import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
} from './constants.js'
import {
	assertHttpServerRequest,
	readHttpApplicationId,
	type HttpApplication,
	type HttpServerRequest,
} from './application.js'

/** Distinguishes lifecycle ownership without changing the mounted graph. */
export type HttpServerOwnership = 'external' | 'framework'

/** Proves the minimum provider contract before any application is registered. */
export interface HttpServerProviderCompatibility {
	readonly applicationProtocolVersion: typeof httpApplicationProtocolVersion
	readonly originalHeaderMode: typeof httpOriginalHeaderMode
	readonly ownership: HttpServerOwnership
}

interface HttpApplicationMountTableState {
	applications: readonly HttpApplication[]
	readonly compatibility: HttpServerProviderCompatibility
}

const mountTableStates = new WeakMap<
	HttpApplicationMountTable,
	HttpApplicationMountTableState
>()
const compatibilityKeys = new Set([
	'applicationProtocolVersion',
	'originalHeaderMode',
	'ownership',
])

const snapshotCompatibility = (
	compatibility: HttpServerProviderCompatibility,
): HttpServerProviderCompatibility => {
	const untrustedCompatibility: unknown = compatibility
	if (!isPlainRecord(untrustedCompatibility)) {
		throw new TypeError(
			'HTTP server provider compatibility must be a plain object',
		)
	}
	for (const key of Reflect.ownKeys(untrustedCompatibility)) {
		if (typeof key !== 'string' || !compatibilityKeys.has(key)) {
			throw new TypeError(
				`HTTP server provider compatibility contains unknown option: ${String(key)}`,
			)
		}
	}
	if (
		untrustedCompatibility.applicationProtocolVersion !==
		httpApplicationProtocolVersion
	) {
		throw new TypeError(
			`Unsupported HTTP application protocol version: ${String(untrustedCompatibility.applicationProtocolVersion)}`,
		)
	}
	if (untrustedCompatibility.originalHeaderMode !== httpOriginalHeaderMode) {
		throw new TypeError(
			'HTTP server providers must preserve ordered original header pairs',
		)
	}
	if (
		untrustedCompatibility.ownership !== 'external' &&
		untrustedCompatibility.ownership !== 'framework'
	) {
		throw new TypeError(
			'HTTP server provider ownership must be external or framework',
		)
	}
	return immutableRecord({
		applicationProtocolVersion: httpApplicationProtocolVersion,
		originalHeaderMode: httpOriginalHeaderMode,
		ownership: untrustedCompatibility.ownership,
	})
}

const readState = (
	table: HttpApplicationMountTable,
): HttpApplicationMountTableState => {
	const state = mountTableStates.get(table)
	if (state === undefined)
		throw new TypeError('Unknown HTTP application mount table')
	return state
}

const assertApplication: (
	application: unknown,
) => asserts application is HttpApplication = (application) => {
	if (
		!isPlainRecord(application) ||
		typeof application.appId !== 'string' ||
		application.appId.length === 0 ||
		application.protocolVersion !== httpApplicationProtocolVersion ||
		application.originalHeaderMode !== httpOriginalHeaderMode ||
		!isPlainRecord(application.routeGraph) ||
		typeof application.fetch !== 'function'
	) {
		throw new TypeError(
			'HTTP server provider received an incompatible application',
		)
	}
}

/**
 * Builds immutable mount-table replacements so a provider can commit one
 * validated application without exposing partial registration state.
 */
export class HttpApplicationMountTable {
	constructor(compatibility: HttpServerProviderCompatibility) {
		mountTableStates.set(this, {
			applications: immutableArray([]),
			compatibility: snapshotCompatibility(compatibility),
		})
		Object.freeze(this)
	}

	/** Reports the provider ownership and input guarantees validated at creation. */
	get compatibility(): HttpServerProviderCompatibility {
		return readState(this).compatibility
	}

	/** Reports the number of independently selected mounted applications. */
	get size(): number {
		return readState(this).applications.length
	}

	/** Returns a stable snapshot in successful registration order. */
	values(): readonly HttpApplication[] {
		return readState(this).applications
	}

	/** Validates a complete candidate before returning the next mount table. */
	mount(application: HttpApplication): HttpApplicationMountTable {
		assertApplication(application)
		const state = readState(this)
		const existing = state.applications.find(
			(candidate) => candidate.appId === application.appId,
		)
		if (existing === application) return this
		if (existing !== undefined) {
			throw new TypeError('HTTP application ID is already mounted')
		}

		const next = new HttpApplicationMountTable(state.compatibility)
		readState(next).applications = immutableArray([
			...state.applications,
			application,
		])
		return next
	}

	/** Removes only the exact application instance owned by one lifecycle. */
	unmount(application: HttpApplication): HttpApplicationMountTable {
		assertApplication(application)
		const state = readState(this)
		if (!state.applications.includes(application)) return this

		const next = new HttpApplicationMountTable(state.compatibility)
		readState(next).applications = immutableArray(
			state.applications.filter((candidate) => candidate !== application),
		)
		return next
	}

	/** Selects one exact application from uncombined original header evidence. */
	select(input: HttpServerRequest): HttpApplication {
		assertHttpServerRequest(input)
		const appId = readHttpApplicationId(input)
		const application = readState(this).applications.find(
			(candidate) => candidate.appId === appId,
		)
		if (application === undefined) {
			throw new TypeError('HTTP application request was rejected')
		}
		return application
	}

	/** Selects the application first, then delegates one Fetch request. */
	fetch(input: HttpServerRequest): Promise<Response | undefined> {
		return this.select(input).fetch(input)
	}
}
