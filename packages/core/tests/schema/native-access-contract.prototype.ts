import {
	RequestContextValue,
	Schema,
	allMutations,
	allowAll,
	booleanField,
	definePlugin,
	denyAll,
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

export const readOnlyOperations = {
	read: /* hover:allow-all */ allowAll,
	.../* hover:all-mutations */ allMutations(denyAll),
}

export const AccessPost = Schema.define({
	className: 'AccessPost',
	access: {
		operation: {
			read: {
				one: true,
				many: ({ context, /* hover:operation-kind */ kind }) => {
					const /* hover:context-value */ current = context.getValue(principal)
					// The literal terminal is intentionally consumed for packed hover coverage.
					void kind

					return current !== undefined
				},
				count: false,
				exists: true,
			},
		},
		filter: {
			read: ({ /* hover:access-filter */ filter }) =>
				filter.equalTo('published', true),
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
				create: ({ /* hover:field-value */ value }) => value === true,
				read: { filter: false, item: true, order: false },
				update: false,
			},
		}),
		title: stringField({ validation: { required: true } }),
	},
})

export const /* hover:schema-definition */ accessPostSchema = AccessPost

export const fixtureAccessProvider = definePlugin({
	name: 'fixture.access-provider',
	setup: ({ /* hover:plugin-access */ access }) => {
		access.schema(
			'published-posts',
			AccessPost,
			{ filter: { read: ({ filter }) => filter.equalTo('published', true) } },
			{ master: 'enforce' },
		)
	},
})
