import {
	RequestContextValue,
	Schema,
	booleanField,
	stringField,
} from '../../src/index.js'

interface Principal {
	readonly id: string
}

const principal = new RequestContextValue<Principal>(
	'fixture.principal',
	(value) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('id' in value) ||
			typeof value.id !== 'string'
		) {
			throw new TypeError('Invalid fixture principal')
		}

		return Object.freeze({ id: value.id })
	},
)

export const AccessPost = Schema.define({
	className: 'AccessPost',
	access: {
		operation: {
			read: ({ context, /* hover:operation-kind */ kind }) => {
				const /* hover:context-value */ current = context.getValue(principal)

				return kind === 'find' && current !== undefined
			},
		},
		filter: {
			read: ({ filter }) => filter.equalTo('published', true),
		},
		item: {
			update: ({ /* hover:update-input */ input, item }) =>
				input.authorId === undefined || input.authorId === item.authorId,
		},
	},
	fields: {
		authorId: stringField({ validation: { required: true } }),
		published: booleanField({
			access: {
				create: ({ /* hover:field-value */ value }) => value,
				read: true,
				update: false,
			},
		}),
		title: stringField({ validation: { required: true } }),
	},
})

export const /* hover:schema-definition */ accessPostSchema = AccessPost
