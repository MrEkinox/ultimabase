import { Schema } from '@ultimabase/core'

export const Account = Schema.define({
	className: 'DocsAccount',
	fields: (field) => ({
		email: field.string({ required: true }),
	}),
})

export const Session = Schema.define({
	className: 'DocsSession',
	fields: (field) => ({
		account: field.pointer({
			onDelete: 'cascade',
			required: true,
			target: 'DocsAccount',
		}),
		expiresAt: field.dateTime({ required: true }),
	}),
})

export const accountReference = Account.pointer(
	'0198f090-2a50-7000-8000-000000000034',
)
