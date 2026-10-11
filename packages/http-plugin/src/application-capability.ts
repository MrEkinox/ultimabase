import { defineCapability, type CapabilityToken } from '@ultimabase/core/plugin'
import { isPlainRecord } from '@ultimabase/shared'

import type { HttpApplication } from './application.js'
import {
	httpApplicationProtocolVersion,
	httpOriginalHeaderMode,
	isHttpRequestTimeoutMs,
} from './constants.js'

const assertHttpApplication: (
	application: unknown,
) => asserts application is HttpApplication = (application) => {
	if (!isPlainRecord(application)) {
		throw new TypeError('HTTP application capability must be a plain object')
	}
	if (application.protocolVersion !== httpApplicationProtocolVersion) {
		throw new TypeError(
			`Unsupported HTTP application protocol version: ${String(application.protocolVersion)}`,
		)
	}
	if (application.originalHeaderMode !== httpOriginalHeaderMode) {
		throw new TypeError(
			'HTTP application requires ordered original header pairs',
		)
	}
	if (typeof application.appId !== 'string' || application.appId.length === 0) {
		throw new TypeError('HTTP application appId must be a non-empty string')
	}
	if (
		!isPlainRecord(application.authority) ||
		!isPlainRecord(application.authority.master) ||
		typeof application.authority.master.enabled !== 'boolean' ||
		!isHttpRequestTimeoutMs(application.requestTimeoutMs) ||
		!isPlainRecord(application.routeGraph) ||
		typeof application.fetch !== 'function'
	) {
		throw new TypeError('HTTP application capability is malformed')
	}
}

/** Carries one versioned HTTP application from httpPlugin() to server providers. */
export const httpApplicationCapability: CapabilityToken<
	HttpApplication,
	HttpApplication,
	'ultimabase.http.application',
	'1.0.0',
	'single',
	'application'
> = defineCapability<HttpApplication>()({
	capabilityId: 'ultimabase.http.application',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	hint: 'Install @ultimabase/http-plugin and add httpPlugin() to UltimaBase.use(...).',
	compose: ([application]) => {
		assertHttpApplication(application)
		return application
	},
})
