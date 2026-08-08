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
		read: {
			allow: {
				one: true,
				many: (/* hover:operation-access-input */ input) => {
					const { context } = input
					const /* hover:context-value */ current = context.getValue(principal)
					// @ts-expect-error -- Operation Access exposes no internal terminal kind.
					void input.kind

					return current !== undefined
				},
				count: false,
				exists: true,
			},
			where: ({ /* hover:access-where */ where }) =>
				where.eq('published', true),
		},
		create: {
			item: ({ item }) => {
				const /* hover:create-access-item */ draft = item

				draft.get('authorId')

				return true
			},
		},
		update: {
			item: ({ originalItem, item }) => {
				const /* hover:update-original-access-item */ persisted = originalItem
				const /* hover:update-access-item */ candidate = item

				persisted.get('authorId')
				void persisted.update({ data: { title: 'Updated' } })
				candidate.title.toUpperCase()

				return persisted.authorId === candidate.authorId
			},
		},
		delete: {
			item: ({ originalItem }) => originalItem.authorId.length > 0,
		},
	},
	fields: {
		authorId: stringField({ validation: { required: true } }),
		published: booleanField({
			access: {
				read: { orderBy: false, output: true, where: false },
				write: {
					fill: ({ /* hover:field-value */ value }) => value,
					replace: false,
					clear: false,
				},
			},
		}),
		title: stringField({
			access: {
				write: {
					clear: ({ originalValue }) => {
						const /* hover:field-clear-original-value */ previous =
								originalValue

						return previous.length > 0
					},
					fill: ({ value }) => {
						const /* hover:field-fill-value */ candidate = value

						return candidate.length > 0
					},
					replace: ({ originalValue, value }) => {
						const /* hover:field-original-value */ previous = originalValue
						const /* hover:field-update-value */ candidate = value

						return previous !== candidate
					},
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
			{ read: { where: ({ where }) => where.eq('published', true) } },
			{ master: 'enforce' },
		)
	},
})
