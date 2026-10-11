import {
	booleanField,
	definePluginFieldFamily,
	UltimaBase,
	type Model,
} from '../../src/index.js'
import {
	contributeDeclarations,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	defineSchemaOption,
	plugin,
} from '../../src/plugin.js'

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

// ADR-0310: results are frozen plain data; schemas carry every command.
export declare const item: Model<typeof Post>
export const importanceValue = item./* hover:plugin-value */ important
export const directQueryResult = Post./* hover:direct-query */ findMany()
export const directCreateResult = Post./* hover:direct-create */ createOne({
	data: { important: true, title: 'Typed' },
})

/** Exercises selected results and the schema update command presentation. */
export const selectedResults = async () => {
	const /* hover:selected-model */ selected =
			await Post./* hover:schema-update */ updateOne({
				where: { title: { eq: 'Typed' } },
				data: { title: 'Updated' },
				select: { title: true },
			})
	if (selected === null) return undefined
	// @ts-expect-error -- Results are readonly.
	selected.title = 'Changed'
	const exact: string = selected./* completion:selected-fields */ title
	// @ts-expect-error -- Installed fields remain absent when not selected.
	void selected.important
	// @ts-expect-error -- Results have no model methods (ADR-0310).
	void selected.update
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
