import {
	Schema,
	defineSchemaExtension,
	intField,
	stringField,
} from '../../src/index.js'

const permissionsExtension = defineSchemaExtension('fixture.permissions', {
	marker: 'OPAQUE_PERMISSION_CONFIG_MUST_NOT_LEAK',
})

export const ArticleSchema = new Schema({
	className: 'HookedArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
	extensions: [permissionsExtension],
	hooks: {
		resolveInput: [
			(input) => {
				if (input.kind === 'create-one') {
					const /* hover:create-input */ createInput = input.operation.input

					createInput.title.toUpperCase()
				}

				if (input.kind === 'update-one') {
					const /* hover:update-expression */ update = input.operation.update

					void update.operations
				}

				return input.operation
			},
			({ operation }) => {
				const /* hover:schema-list-operation */ listedOperation = operation

				return listedOperation
			},
		],
		/* hover:schema-family-declaration */ beforeSave: {
			all: ({ operation }) => operation,
			create: ({ operation }) => {
				const /* hover:create-family-kind */ kind = operation.kind

				void kind
				return operation
			},
		},
		beforeFind: [
			({ query }) => {
				const /* hover:query */ selectedQuery = query

				return selectedQuery.limit(100)
			},
			({ query }) => query,
		],
		afterOperation: (input) => {
			if (input.kind === 'count') {
				const /* hover:count-result */ count = input.result

				count.toFixed()
			}

			if (input.kind === 'create-one') {
				const /* hover:create-result */ created = input.result

				created.title.toUpperCase()
			}

			return input.result
		},
		onError: ({ error }) => {
			const /* hover:error */ failure = error

			void failure
		},
	},
})

new Schema({
	/* completion:schema-options */
	className: 'CompletionSchema',
	fields: {},
})

new Schema({
	className: 'HookCompletionSchema',
	fields: {},
	hooks: {/* completion:schema-hooks */},
})

new Schema({
	className: 'OperationFamilyCompletionSchema',
	fields: {},
	hooks: {
		// @ts-expect-error -- The incomplete map exists only to request completions.
		beforeOperation: {/* completion:schema-operation-families */},
	},
})

new Schema({
	className: 'SaveFamilyCompletionSchema',
	fields: {},
	hooks: {
		// @ts-expect-error -- The incomplete map exists only to request completions.
		beforeSave: {/* completion:schema-save-families */},
	},
})

new Schema({
	className: 'ListCompletionSchema',
	fields: {},
	hooks: {
		beforeCreate: [
			({ /* completion:schema-list-input */ ...input }) => input.operation,
		],
	},
})

new Schema({
	className: 'InvalidFamilySchema',
	fields: {},
	hooks: {
		// @ts-expect-error -- Read families are unavailable to save-only phases.
		beforeSave: {
			find: () => undefined,
		},
	},
})

new Schema({
	className: 'InvalidEmptyListSchema',
	fields: {},
	hooks: {
		// @ts-expect-error -- Ordered hook declarations must never be empty.
		beforeCreate: [],
	},
})
