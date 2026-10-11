import { defineCapability, type CapabilityToken } from '@ultimabase/core/plugin'
import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

/** Announces one server plugin that serves the HTTP application. */
export interface HttpServerDescriptor {
	/** Package name of the server plugin. @example "@ultimabase/hono-server-plugin" */
	readonly name: string
}

const normalizeHttpServer = (value: unknown): HttpServerDescriptor => {
	if (!isPlainRecord(value) || Reflect.ownKeys(value).length !== 1) {
		throw new TypeError('HTTP server capability must contain only name')
	}
	const name = value.name
	assertNonEmptyString(name, 'HTTP server capability name')
	return immutableRecord({ name })
}

/**
 * Lets server plugins announce that they serve the HTTP application, so
 * `httpPlugin()` can warn when routes have no server (ADR-0313).
 */
export const httpServerCapability: CapabilityToken<
	HttpServerDescriptor,
	readonly HttpServerDescriptor[],
	'ultimabase.http.server',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<HttpServerDescriptor, readonly HttpServerDescriptor[]>()({
	capabilityId: 'ultimabase.http.server',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (servers) => immutableArray(servers.map(normalizeHttpServer)),
})
