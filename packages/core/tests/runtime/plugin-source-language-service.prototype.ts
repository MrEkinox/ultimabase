import {
	booleanField,
	contributeDeclarations,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	definePluginFieldFamily,
	defineSchemaOption,
	plugin,
	UltimaBase,
} from '../../src/index.js'

const importance = (options: { readonly required: true }) =>
	booleanField({ required: options.required })

const importanceFamily = definePluginFieldFamily({
	fieldKind: 'fixture.importance',
	typegen: {
		module: '@fixture/importance-plugin',
		valueType: 'ImportanceValue',
	},
	builder: {
		name: 'importance',
		contexts: {
			stored: {
				factory: importance,
				methodType: 'ImportanceFieldBuilderMethod',
			},
		},
	},
})

const workflowOption = defineSchemaOption({
	normalize: (value): Readonly<{ enabled: boolean }> => ({
		enabled: value === true,
	}),
	protocolVersion: 1,
	typegen: false,
})

const inspect = defineOperation({
	input: defineOperationValue((value: unknown) => String(value)),
	name: 'fixture.source.inspect',
	result: defineOperationValue((value: unknown) => Number(value)),
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})

const sourcePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.source-language-service',
	permissions: {
		'operation:declare': 'Declares the inspect operation.',
		'schema:declare': 'Declares importance fields and workflow options.',
	},
	version: '1.0.0',
	contributions: [
		contributeOperation({
			execute: ({ input }) => Number(input),
			operation: inspect,
		}),
		contributeDeclarations({
			schema: ({ fields, schemas }) => [
				fields.register(importanceFamily),
				schemas.defineOptions({
					contributionId: 'workflow-options',
					schema: { workflow: workflowOption },
				}),
			],
		}),
	],
})

export const Application = UltimaBase.use(sourcePlugin)
export const Post = Application.Schema.define({
	className: 'PluginSourceLanguagePost',
	fields: (field) => ({
		important: field./* completion:plugin-field */ importance({
			required: true,
		}),
		title: field.string({ required: true }),
	}),
	workflow: { enabled: true },
})

export const item = new Post({ important: true, title: 'Typed' })
export const importanceValue = item./* hover:plugin-value */ important
export const directQueryResult = Post./* hover:direct-query */ findMany()
export const directCreateResult = item./* hover:direct-create */ create({})

/** Exercises readonly command composition and its public editor presentation. */
export const selectedModelCommands = async () => {
	const persisted = await item.create({})
	const updateCommand = persisted.update
	// @ts-expect-error -- Command composition must not make methods writable.
	persisted.update = updateCommand
	const /* hover:selected-model */ selected =
			await persisted./* hover:model-update */ update({
				data: { title: 'Updated' },
				select: { title: true },
			})
	const exact: string = selected./* completion:selected-fields */ title
	// @ts-expect-error -- Installed fields remain absent when not selected.
	void selected.important
	// @ts-expect-error -- Command inputs preserve their scalar types.
	void selected.update({ data: { title: 42 } })
	const snapshotCommand = selected.get
	// @ts-expect-error -- Selected model helpers are readonly too.
	selected.get = snapshotCommand
	void selected.fetch({ select: { important: true } })
	return exact
}

export const application = new Application({ schemas: [Post] })
export const operationResult = application
	.operation('fixture.source.inspect')
	./* hover:plugin-operation-result */ execute('1')

export const CoreOnly = UltimaBase.Schema.define({
	className: 'PluginSourceLanguageCoreOnly',
	fields: (field) => ({
		title: field./* completion:core-field */ string(),
	}),
})
