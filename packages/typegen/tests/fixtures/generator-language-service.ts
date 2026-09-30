import path from 'node:path'

import { UltimaBase, Schema } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { RoleSchema, rolesPlugin } from '@ultimabase/roles-plugin'
import * as ts from 'typescript'
import {
	createLanguageServiceWorkspace,
	type LanguageServiceWorkspace,
} from '../../../../tooling/vitest/typescript-language-service.js'
import { generateApplicationTypes } from '../../src/generator.js'

export const createGeneratedRegistry = (): string => {
	const FixtureApplication = UltimaBase.use(accessPlugin())
		.use(hooksPlugin())
		.use(pgVectorPlugin())
	const Author = FixtureApplication.Schema.define({
		className: 'SemanticAuthor',
		fields: (field) => ({
			name: field.string({ required: true }),
			articles: field.relation({ target: 'SemanticArticle' }),
		}),
	})
	const Article = FixtureApplication.Schema.define({
		className: 'SemanticArticle',
		fields: (field) => ({
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
			embedding: field.vector({
				dimensions: 3,
			}),
			embeddings: field.vector({
				dimensions: 3,
				list: true,
			}),
		}),
	})
	const application = new FixtureApplication({
		schemas: [Author, Article],
	})

	return generateApplicationTypes({
		ultimabase: application,
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
	const application = new (UltimaBase.use(hooksPlugin(), rolesPlugin()))({
		schemas: [Member, Role],
	})

	return generateApplicationTypes({
		ultimabase: application,
		applicationId: 'fixture.semantic-role',
	}).contents
}

export const createSourceLanguageServiceWorkspace =
	(): LanguageServiceWorkspace => {
		const repositoryRoot = path.resolve(import.meta.dirname, '../../../..')
		return createLanguageServiceWorkspace({
			compilerOptions: {
				baseUrl: repositoryRoot,
				exactOptionalPropertyTypes: true,
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				paths: {
					'@ultimabase/access-plugin': ['packages/access-plugin/src/index.ts'],
					'@ultimabase/core': ['packages/core/src/index.ts'],
					'@ultimabase/hooks-plugin': ['packages/hooks-plugin/src/index.ts'],
					'@ultimabase/pg-vector-plugin': [
						'packages/pg-vector-plugin/src/index.ts',
					],
					'@ultimabase/roles-plugin': ['packages/roles-plugin/src/index.ts'],
					'@ultimabase/shared': ['packages/shared/src/index.ts'],
				},
				strict: true,
				target: ts.ScriptTarget.ESNext,
				types: ['node'],
			},
			currentDirectory: repositoryRoot,
		})
	}

export const createSourceLanguageService = (
	fileName: string,
	source: string,
): ts.LanguageService => {
	const workspace = createSourceLanguageServiceWorkspace()

	workspace.addFile(fileName, source)
	return workspace.service
}
