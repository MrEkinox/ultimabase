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
		resolveInput: (input) => {
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
		beforeFind: ({ query }) => {
			const /* hover:query */ selectedQuery = query

			return selectedQuery.limit(100)
		},
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
