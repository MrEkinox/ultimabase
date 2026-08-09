import { Schema, defineSchemaExtension } from '../../src/index.js'

const permissionsExtension = defineSchemaExtension('fixture.permissions', {
	marker: 'OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK',
})

export const ArticleSchema = Schema.define({
	className: 'HookedArticle',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		views: field.int(),
	}),
	extensions: [permissionsExtension],
	hooks: {
		resolveInput: {
			all: ({ operation }) => {
				const /* hover:schema-list-operation */ listedOperation = operation

				return listedOperation
			},
			create: (input) => {
				const /* hover:create-family-kind */ kind = input.operation.kind
				const /* hover:create-input */ createInput = input.operation.input

				void kind
				createInput.title.toUpperCase()

				return input.operation
			},
			update: (input) => {
				const /* hover:update-expression */ update = input.operation.update

				void update.operations

				return input.operation
			},
			upsert: ({ operation }) => operation,
		},
		/* hover:schema-family-declaration */ beforeOperation: {
			create: [
				({ /* completion:schema-list-input */ ...input }) => void input,
				({ kind }) => {
					const /* hover:before-create-kind */ createKind = kind

					void createKind
				},
				({ item }) => {
					const /* hover:before-create-item */ preparedItem = item

					preparedItem.id.toString()
				},
			],
			update: ({ operation, originalItem }) => {
				const /* hover:before-update-original-item */ persistedItem =
						originalItem

				persistedItem.id.toString()
				void operation
			},
			delete: ({ kind }) => {
				const /* hover:before-delete-kind */ deleteKind = kind

				void deleteKind
			},
		},
		afterOperation: {
			create: (input) => {
				const /* hover:create-item */ created = input.item
				const /* hover:create-item-update */ update = created.update

				created.id.toString()
				void update
			},
		},
	},
})

Schema.define({
	/* completion:schema-options */
	className: 'CompletionSchema',
	fields: () => ({}),
})

Schema.define({
	className: 'HookCompletionSchema',
	fields: () => ({}),
	hooks: {/* completion:schema-hooks */},
})

Schema.define({
	className: 'OperationGroupCompletionSchema',
	fields: () => ({}),
	hooks: {
		beforeOperation: {/* completion:schema-operation-families */},
	},
})

Schema.define({
	className: 'SaveFamilyCompletionSchema',
	fields: () => ({}),
	hooks: {
		// @ts-expect-error -- The incomplete map exists only to request completions.
		resolveInput: {/* completion:schema-save-families */},
	},
})

Schema.define({
	className: 'InvalidFamilySchema',
	fields: () => ({}),
	hooks: {
		resolveInput: {
			// @ts-expect-error -- Read families are unavailable to save-only phases.
			read: () => undefined,
		},
	},
})

Schema.define({
	className: 'InvalidEmptyListSchema',
	fields: () => ({}),
	hooks: {
		beforeOperation: {
			// @ts-expect-error -- Ordered hook declarations must never be empty.
			create: [],
		},
	},
})
