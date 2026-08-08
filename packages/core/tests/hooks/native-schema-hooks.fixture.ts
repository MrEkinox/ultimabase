import {
	Schema,
	defineSchemaExtension,
	intField,
	stringField,
} from '../../src/index.js'

const permissionsExtension = defineSchemaExtension('fixture.permissions', {
	marker: 'OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK',
})

export const ArticleSchema = Schema.define({
	className: 'HookedArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
	extensions: [permissionsExtension],
	hooks: {
		resolveInput: {
			all: ({ operation }) => {
				const /* hover:schema-list-operation */ listedOperation = operation

				return listedOperation
			},
			create: (input) => {
				const /* hover:create-family-kind */ kind = input.operation.kind

				void kind
				if (input.kind === 'create-one') {
					const /* hover:create-input */ createInput = input.operation.input

					createInput.title.toUpperCase()
				}

				return input.operation
			},
			update: (input) => {
				if (input.kind === 'update-one') {
					const /* hover:update-expression */ update = input.operation.update

					void update.operations
				}

				return input.operation
			},
			upsert: ({ operation }) => operation,
		},
		/* hover:schema-family-declaration */ beforeOperation: {
			create: [({ /* completion:schema-list-input */ ...input }) => void input],
			update: ({ operation }) => void operation,
		},
		afterOperation: {
			create: (input) => {
				if (input.kind === 'create-one') {
					const /* hover:create-result */ created = input.item

					created.title.toUpperCase()
				}

				void input.result
			},
		},
		transaction: {
			afterCommit: ({ changes }) => {
				const /* hover:transaction-changes */ committed = changes

				void committed
			},
		},
	},
})

Schema.define({
	/* completion:schema-options */
	className: 'CompletionSchema',
	fields: {},
})

Schema.define({
	className: 'HookCompletionSchema',
	fields: {},
	hooks: {/* completion:schema-hooks */},
})

Schema.define({
	className: 'OperationGroupCompletionSchema',
	fields: {},
	hooks: {
		beforeOperation: {/* completion:schema-operation-families */},
	},
})

Schema.define({
	className: 'SaveFamilyCompletionSchema',
	fields: {},
	hooks: {
		// @ts-expect-error -- The incomplete map exists only to request completions.
		resolveInput: {/* completion:schema-save-families */},
	},
})

Schema.define({
	className: 'InvalidFamilySchema',
	fields: {},
	hooks: {
		resolveInput: {
			// @ts-expect-error -- Read families are unavailable to save-only phases.
			read: () => undefined,
		},
	},
})

Schema.define({
	className: 'InvalidEmptyListSchema',
	fields: {},
	hooks: {
		beforeOperation: {
			// @ts-expect-error -- Ordered hook declarations must never be empty.
			create: [],
		},
	},
})
