import path from 'node:path'

import { UltimaBase, defineEnum } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { rolesPlugin } from '@ultimabase/roles-plugin'
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
	// ADR-0310: one shared enum names one generated type.
	const SemanticStatus = defineEnum('SemanticStatus', ['draft', 'published'])
	const Article = FixtureApplication.Schema.define({
		className: 'SemanticArticle',
		fields: (field) => ({
			title: field.string({ required: true }),
			views: field.int(),
			scores: field.int({ list: true }),
			statuses: field.enum({ list: true, values: SemanticStatus }),
			status: field.enum({ required: true, values: SemanticStatus }),
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
	const Member = UltimaBase.Schema.define({
		className: 'SemanticRoleMember',
		fields: (field) => ({
			name: field.string({ required: true }),
		}),
	})
	const RoleApplication = UltimaBase.use(hooksPlugin(), rolesPlugin())
	const Role = RoleApplication.RoleSchema.define({
		className: 'SemanticRole',
		fields: (field) => ({
			description: field.string(),
		}),
		members: () => Member,
	}).with({})
	const application = new RoleApplication({
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
					'@ultimabase/core/plugin': ['packages/core/src/plugin.ts'],
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
