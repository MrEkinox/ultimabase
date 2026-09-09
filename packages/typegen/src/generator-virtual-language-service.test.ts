import path from 'node:path'

import { FrameworkApplication, Schema } from '@ultimabase/core'
import * as ts from 'typescript'
import { expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

const createGeneratedVirtualRegistry = (): string => {
	const User = Schema.define({
		className: 'SemanticVirtualUser',
		fields: (field) => ({
			firstName: field.string({ required: true }),
			lastName: field.string({ required: true }),
			friends: field.relation({ target: 'SemanticVirtualUser' }),
			displayName: field.virtual({
				output: (output) => output.string({ nullable: false }),
				resolve: ({ item }) =>
					`${String(item.firstName)} ${String(item.lastName)}`,
				select: { firstName: true, lastName: true },
			}),
			summary: field.virtual({
				output: (output) =>
					output.object({
						fields: (output) => ({
							label: output.string({ nullable: false }),
							tags: output.string({ list: true, nullable: false }),
						}),
						nullable: false,
						typeName: 'SemanticVirtualSummary',
					}),
				resolve: ({ item }) => ({
					label: String(item.firstName),
					tags: ['public'],
				}),
				select: { firstName: true },
			}),
		}),
	})

	return generateApplicationTypes({
		application: new FrameworkApplication({ plugins: [], schemas: [User] }),
		applicationId: 'fixture.semantic-virtual',
	}).contents
}

const createSourceLanguageService = (
	fileName: string,
	source: string,
): ts.LanguageService => {
	const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
	const host: ts.LanguageServiceHost = {
		fileExists: (requestedFileName) => ts.sys.fileExists(requestedFileName),
		getCompilationSettings: () => ({
			baseUrl: repositoryRoot,
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			paths: {
				'@ultimabase/core': ['packages/core/src/index.ts'],
				'@ultimabase/shared': ['packages/shared/src/index.ts'],
			},
			strict: true,
			target: ts.ScriptTarget.ESNext,
			types: ['node'],
		}),
		getCurrentDirectory: () => repositoryRoot,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getScriptFileNames: () => [fileName],
		getScriptSnapshot: (requestedFileName) => {
			const contents =
				requestedFileName === fileName
					? source
					: ts.sys.readFile(requestedFileName)

			return contents === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(contents)
		},
		getScriptVersion: () => '0',
		readFile: (requestedFileName) => ts.sys.readFile(requestedFileName),
	}

	return ts.createLanguageService(host)
}

it('types virtual dependencies and separates persisted items from outputs', () => {
	const registry = createGeneratedVirtualRegistry()
	const source = `${registry}
import { Schema, type SchemaItem, type SchemaOutput } from '@ultimabase/core'

const User = Schema.define({
  className: 'SemanticVirtualUser',
  fields: (field) => ({
    firstName: field.string({ required: true }),
    lastName: field.string({ required: true }),
    friends: field.relation({ target: 'SemanticVirtualUser' }),
    displayName: field.virtual({
      output: (output) => output.string({ nullable: false }),
      select: { firstName: true, lastName: true },
      resolve: async ({ item, context }) => {
        const id: string = item.id
        const firstName: string = item.firstName
        const lastName: string = item.lastName
        const source: string = context.source
        // @ts-expect-error -- Resolver items contain only declared dependencies.
        item.createdAt
        return source === 'internal' ? id : firstName + ' ' + lastName
      },
    }),
    summary: field.virtual({
      output: (output) => output.object({
        nullable: false,
        typeName: 'SemanticVirtualSummary',
        fields: (output) => ({
          label: output.string({ nullable: false }),
          tags: output.string({ list: true, nullable: false }),
        }),
      }),
      select: { firstName: true },
      resolve: ({ item }) => ({ label: item.firstName, tags: ['public'] }),
    }),
    invalidDependency: field.virtual({
      output: (output) => output.string(),
      // @ts-expect-error -- Virtual and relation fields are not dependencies.
      select: { displayName: true },
      resolve: () => null,
    }),
  }),
})

declare const item: SchemaItem<typeof User>
declare const output: SchemaOutput<typeof User>
const firstName: string = item.firstName
// @ts-expect-error -- Persisted items never contain virtual values.
item.displayName
const displayName: string = output.displayName
const tags: readonly string[] = output.summary.tags

User.findMany({ select: { displayName: true, summary: true } })
User.findMany({
  // @ts-expect-error -- Virtual fields cannot filter.
  where: { displayName: { eq: 'Ada' } },
})
User.findMany({
  // @ts-expect-error -- Virtual fields cannot order.
  orderBy: { displayName: 'asc' },
})
User.createOne({
  data: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    // @ts-expect-error -- Virtual fields are output-only.
    displayName: 'Ada Lovelace',
  },
})

void [displayName, firstName, tags]
`
	const fileName = path.join(
		import.meta.dirname,
		'generated-virtual.semantic.fixture.ts',
	)
	const service = createSourceLanguageService(fileName, source)
	expect(
		service
			.getSemanticDiagnostics(fileName)
			.map(({ messageText }) =>
				ts.flattenDiagnosticMessageText(messageText, '\n'),
			),
	).toStrictEqual([])
	expect(registry).toContain('SemanticVirtualUserOutput')
	expect(registry).toContain('readonly displayName?: boolean')
	service.dispose()
})
