import path from 'node:path'

import {
	FrameworkApplication,
	Schema,
	type FieldBuilder,
} from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
} from '@ultimabase/pg-vector-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import * as ts from 'typescript'
import { generateApplicationTypes } from '../../src/generator.js'

type GeneratedFixtureBuilder = FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

export const createGeneratedRegistry = (): string => {
	const Author = Schema.define({
		className: 'SemanticAuthor',
		fields: (field) => ({
			name: field.string({ required: true }),
			articles: field.relation({ target: 'SemanticArticle' }),
		}),
	})
	const Article = Schema.define({
		className: 'SemanticArticle',
		fields: (field) => {
			const generatedField = field as GeneratedFixtureBuilder
			return {
				title: field.string({ required: true }),
				views: field.int(),
				scores: field.int({ list: true }),
				statuses: field.enum({
					list: true,
					typeName: 'SemanticStatus',
					values: ['draft', 'published'],
				}),
				status: field.enum({
					typeName: 'SemanticStatus',
					required: true,
					values: ['draft', 'published'],
				}),
				profile: field.object({
					fields: (field) => ({
						displayName: field.string({
							required: true,
						}),
					}),
					typeName: 'SemanticProfile',
				}),
				profiles: field.object({
					fields: (field) => ({
						displayName: field.string({
							required: true,
						}),
					}),
					list: true,
					typeName: 'SemanticProfile',
				}),
				author: field.pointer({
					target: 'SemanticAuthor',
					required: true,
				}),
				related: field.relation({
					target: 'SemanticArticle',
				}),
				embedding: generatedField.vector({
					dimensions: 3,
				}),
				embeddings: generatedField.vector({
					dimensions: 3,
					list: true,
				}),
			}
		},
	})
	const application = new FrameworkApplication({
		plugins: [accessPlugin(), hooksPlugin(), pgVectorPlugin()],
		schemas: [Author, Article],
	})

	return generateApplicationTypes({
		application,
		applicationId: 'fixture.semantic',
	}).contents
}

export const createGeneratedRoleRegistry = (): string => {
	const Member = Schema.define({
		className: 'SemanticRoleMember',
		fields: (field) => ({
			name: field.string({ required: true }),
		}),
	})
	const roleCandidate: unknown = RoleSchema.define({
		className: 'SemanticRole',
		fields: (field) => ({
			description: field.string(),
		}),
		members: { schema: Member },
	})
	if (!Schema.is(roleCandidate)) {
		throw new TypeError('Expected the semantic role schema to be defined')
	}
	const Role = roleCandidate
	const application = new FrameworkApplication({
		plugins: [hooksPlugin(), rolesPlugin()],
		schemas: [Member, Role],
	})

	return generateApplicationTypes({
		application,
		applicationId: 'fixture.semantic-role',
	}).contents
}

export const createSourceLanguageService = (
	fileName: string,
	source: string,
): ts.LanguageService => {
	const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
	const host: ts.LanguageServiceHost = {
		fileExists: (requestedFileName) => ts.sys.fileExists(requestedFileName),
		getCompilationSettings: () => ({
			baseUrl: repositoryRoot,
			exactOptionalPropertyTypes: true,
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			paths: {
				'@ultimabase/core': ['packages/core/src/index.ts'],
				'@ultimabase/pg-vector-plugin': [
					'packages/pg-vector-plugin/src/index.ts',
				],
				'@ultimabase/roles-plugin': ['packages/roles-plugin/src/index.ts'],
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
