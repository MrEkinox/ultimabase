//#region tenant-context
import {
	RequestContext,
	RequestContextValue,
	requestSources,
} from '@ultimabase/core/plugin'

export const tenantId = new RequestContextValue<string>(
	'acme.identity.tenant-id',
	(value: unknown) => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('Tenant id must be a non-empty string')
		}
		return value
	},
)

const anonymous = RequestContext.anonymous({
	requestId: 'request-123',
	source: requestSources.internal,
})

export const scoped = anonymous.withValue(tenantId, 'tenant-42')
export const currentTenant = scoped.getValue(tenantId) // string | undefined
export const authorityMode = scoped.access.mode // 'anonymous'
//#endregion tenant-context
