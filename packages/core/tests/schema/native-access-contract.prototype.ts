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
			create: ({ item, kind }) => {
				const /* hover:create-access-item */ draft = item
				const /* hover:create-access-kind */ createKind = kind

				draft.get('authorId')
				void createKind

				return true
			},
			update: ({ originalItem, item, kind }) => {
				const /* hover:update-original-access-item */ persisted = originalItem
				const /* hover:update-access-item */ candidate = item
				const /* hover:update-access-kind */ updateKind = kind

				persisted.get('authorId')
				void persisted.update({ data: { title: 'Updated' } })
				candidate.title.toUpperCase()
				void updateKind

				return persisted.authorId === candidate.authorId
			},
			delete: ({ kind }) => {
				const /* hover:delete-access-kind */ deleteKind = kind

				void deleteKind

				return true
			},
		},
	},
	fields: {
		authorId: stringField({ validation: { required: true } }),
		published: booleanField({
			access: {
				create: ({ kind, /* hover:field-value */ value }) => {
					const /* hover:field-create-kind */ createKind = kind

					return createKind === 'create' && value === true
				},
				read: { filter: false, item: true, order: false },
				update: false,
			},
		}),
		title: stringField({
			access: {
				update: ({ originalValue, value }) => {
					const /* hover:field-original-value */ previous = originalValue
					const /* hover:field-update-value */ candidate = value

					return previous !== candidate
				},
			},
			validation: { required: true },
		}),
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
