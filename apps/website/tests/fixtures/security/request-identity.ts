import { RequestContextValue, Schema } from '@ultimabase/core'

export const tenantId = new RequestContextValue<string>(
	'acme.identity.tenant-id',
	(value) => {
		if (typeof value !== 'string' || value.length === 0) {
			throw new TypeError('Tenant id must be a non-empty string')
		}
		return value
	},
)

export const Tenant = Schema.define({
	className: 'SecurityTenant',
	fields: (field) => ({ name: field.string({ required: true }) }),
})
