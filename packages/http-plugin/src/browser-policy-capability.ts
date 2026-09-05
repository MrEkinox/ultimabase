import { defineCapability, type CapabilityToken } from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'

import type { HttpBrowserPolicy } from './browser-policy.js'

const assertHttpBrowserPolicy: (
	policy: unknown,
) => asserts policy is HttpBrowserPolicy = (policy) => {
	if (!isPlainRecord(policy) || typeof policy.enabled !== 'boolean') {
		throw new TypeError('HTTP browser policy capability is malformed')
	}
	if (!policy.enabled) return
	if (
		(policy.allowedOrigins !== '*' && !Array.isArray(policy.allowedOrigins)) ||
		!Array.isArray(policy.allowedMethods) ||
		!Array.isArray(policy.allowedHeaders) ||
		typeof policy.credentials !== 'boolean' ||
		typeof policy.maxAgeSeconds !== 'number'
	) {
		throw new TypeError('HTTP browser policy capability is malformed')
	}
}

/** Carries one application policy to its concrete HTTP server provider. */
export const httpBrowserPolicyCapability: CapabilityToken<
	HttpBrowserPolicy,
	HttpBrowserPolicy,
	'ultimabase.http.browser-policy',
	'1.0.0',
	'single',
	'application'
> = defineCapability<HttpBrowserPolicy>()({
	capabilityId: 'ultimabase.http.browser-policy',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([policy]) => {
		assertHttpBrowserPolicy(policy)
		return policy
	},
})
