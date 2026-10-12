import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	accessPluginPublicApi,
	apiServerPublicApi,
	getOptionalProductPublicApiNames,
	graphqlExplorerPluginPublicApi,
	graphqlPluginPublicApi,
	graphqlHttpPublicApi,
	graphqlYogaPluginPublicApi,
	hooksPluginPublicApi,
	httpPluginPublicApi,
	passwordAuthPluginPublicApi,
	removedAccessPluginPublicApiNames,
	removedApiServerPublicApiNames,
	removedGraphqlExplorerPluginPublicApiNames,
	removedHooksPluginPublicApiNames,
	removedGraphqlPluginPublicApiNames,
	removedGraphqlHttpPublicApiNames,
	removedGraphqlYogaPluginPublicApiNames,
	removedHttpPluginPublicApiNames,
	removedPasswordAuthPluginPublicApiNames,
	removedRestPluginPublicApiNames,
	removedValidationPluginPublicApiNames,
	restPluginPublicApi,
	type OptionalProductPublicApi,
	validationPluginPublicApi,
} from '../../tooling/vitest/optional-product-public-api.js'
import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

interface OptionalProductFixture {
	readonly classification: OptionalProductPublicApi
	readonly moduleSpecifier:
		| '@ultimabase/access-plugin'
		| '@ultimabase/api-server'
		| '@ultimabase/graphql-explorer-plugin'
		| '@ultimabase/hooks-plugin'
		| '@ultimabase/graphql-plugin'
		| '@ultimabase/graphql-http'
		| '@ultimabase/graphql-yoga-plugin'
		| '@ultimabase/http-plugin'
		| '@ultimabase/password-auth-plugin'
		| '@ultimabase/rest-plugin'
		| '@ultimabase/soft-delete-plugin'
		| '@ultimabase/validation-plugin'
	readonly removedNames: readonly string[]
}

const fixtures: readonly OptionalProductFixture[] = [
	{
		classification: accessPluginPublicApi,
		moduleSpecifier: '@ultimabase/access-plugin',
		removedNames: removedAccessPluginPublicApiNames,
	},
	{
		classification: apiServerPublicApi,
		moduleSpecifier: '@ultimabase/api-server',
		removedNames: removedApiServerPublicApiNames,
	},
	{
		classification: graphqlExplorerPluginPublicApi,
		moduleSpecifier: '@ultimabase/graphql-explorer-plugin',
		removedNames: removedGraphqlExplorerPluginPublicApiNames,
	},
	{
		classification: hooksPluginPublicApi,
		moduleSpecifier: '@ultimabase/hooks-plugin',
		removedNames: removedHooksPluginPublicApiNames,
	},
	{
		classification: graphqlPluginPublicApi,
		moduleSpecifier: '@ultimabase/graphql-plugin',
		removedNames: removedGraphqlPluginPublicApiNames,
	},
	{
		classification: graphqlHttpPublicApi,
		moduleSpecifier: '@ultimabase/graphql-http',
		removedNames: removedGraphqlHttpPublicApiNames,
	},
	{
		classification: graphqlYogaPluginPublicApi,
		moduleSpecifier: '@ultimabase/graphql-yoga-plugin',
		removedNames: removedGraphqlYogaPluginPublicApiNames,
	},
	{
		classification: httpPluginPublicApi,
		moduleSpecifier: '@ultimabase/http-plugin',
		removedNames: removedHttpPluginPublicApiNames,
	},
	{
		classification: passwordAuthPluginPublicApi,
		moduleSpecifier: '@ultimabase/password-auth-plugin',
		removedNames: removedPasswordAuthPluginPublicApiNames,
	},
	{
		classification: restPluginPublicApi,
		moduleSpecifier: '@ultimabase/rest-plugin',
		removedNames: removedRestPluginPublicApiNames,
	},
	{
		classification: {
			applicationApi: [
				'SoftDeleteCommands',
				'SoftDeleteFields',
				'SoftDeleteOptions',
				'SoftDeletePlugin',
				'SoftDeleteSchemaMode',
				'SoftDeleteShape',
				'softDeletePlugin',
			],
			compatibleProviderContract: [],
			conformanceSupport: [],
		},
		moduleSpecifier: '@ultimabase/soft-delete-plugin',
		removedNames: [
			'normalizeSoftDeletePluginOptions',
			'resolveSoftDeleteMode',
			'softDeleteSchemaOption',
			'SoftDeleteMode',
			'SoftDeletePluginOptions',
			'SoftDeleteSchemaOption',
			'SoftDeleteShapeSource',
		],
	},
	{
		classification: validationPluginPublicApi,
		moduleSpecifier: '@ultimabase/validation-plugin',
		removedNames: removedValidationPluginPublicApiNames,
	},
]

describe.each(fixtures)('$moduleSpecifier packed public API', (fixture) => {
	const fixtureFile = path.join(
		import.meta.dirname,
		`${fixture.moduleSpecifier.slice('@ultimabase/'.length)}.packed.fixture.ts`,
	)

	it('exposes every classified root contract through the package archive', () => {
		const marker = '/* exports */'
		const source = `import { ${marker} } from '${fixture.moduleSpecifier}'`
		const service = createLanguageService(fixtureFile, source)
		const completions =
			service
				.getCompletionsAtPosition(fixtureFile, source.indexOf(marker), {})
				?.entries.map(({ name }) => name)
				.filter((name) => name !== 'type')
				.sort() ?? []

		expect(completions).toStrictEqual(
			getOptionalProductPublicApiNames(fixture.classification),
		)
	})

	it('keeps removed implementation details unavailable from the root', () => {
		const source = `import { ${fixture.removedNames.join(', ')} } from '${fixture.moduleSpecifier}'`
		const diagnostics = createLanguageService(
			fixtureFile,
			source,
		).getSemanticDiagnostics(fixtureFile)
		const messages = diagnostics.map(({ messageText }) =>
			ts.flattenDiagnosticMessageText(messageText, ' '),
		)

		expect(messages).toHaveLength(fixture.removedNames.length)
		for (const name of fixture.removedNames) {
			expect(messages.some((message) => message.includes(name))).toBe(true)
		}
	})
})
