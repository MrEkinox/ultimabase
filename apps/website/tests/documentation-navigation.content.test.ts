import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const contentRoot = fileURLToPath(new URL('../content/docs', import.meta.url))

const canonicalNavigation = {
	'1.0.0': [
		'---Introduction---',
		'quick-start',
		'index',
		'manual-installation',
		'---Core---',
		'...core',
		'---Plugins---',
		'...plugins',
		'---Guides---',
		'...guides',
		'---Operate Your Application---',
		'...operations',
		'---Reference---',
		'...reference',
	],
	'1.0.0/core': [
		'application',
		'data-modeling',
		'reading-data',
		'writing-data',
		'runtime',
		'security-foundations',
	],
	'1.0.0/core/data-modeling': [
		'schemas',
		'fields',
		'models',
		'defaults',
		'embedded-objects',
		'virtual-fields',
		'relationships',
	],
	'1.0.0/core/reading-data': [
		'overview',
		'filters',
		'selections',
		'ordering-and-pagination',
		'related-data',
	],
	'1.0.0/core/writing-data': [
		'create',
		'update',
		'delete',
		'upserts',
		'bulk-operations',
		'nested-writes',
		'transactions',
	],
	'1.0.0/core/runtime': [
		'runtime-pipeline',
		'transaction-boundaries',
		'logical-operations-and-persistence',
		'immutability',
		'api-errors',
	],
	'1.0.0/core/security-foundations': [
		'security-model',
		'request-identity',
		'master-authority',
	],
	'1.0.0/plugins': [
		'overview',
		'using-plugins',
		'official',
		'community-plugins',
		'build-a-plugin',
	],
	'1.0.0/plugins/official': [
		'data-and-persistence',
		'validation-and-lifecycle',
		'authentication-and-authorization',
		'http-and-apis',
	],
	'1.0.0/plugins/official/data-and-persistence': [
		'postgresql',
		'soft-delete',
		'postgresql-vector',
	],
	'1.0.0/plugins/official/validation-and-lifecycle': ['validation', 'hooks'],
	'1.0.0/plugins/official/authentication-and-authorization': [
		'password-authentication',
		'access',
		'roles',
		'acl-permissions',
	],
	'1.0.0/plugins/official/http-and-apis': [
		'http',
		'hono-server',
		'rest',
		'graphql',
		'graphql-yoga',
		'graphiql',
		'apollo-sandbox',
	],
	'1.0.0/guides': [
		'build-an-authenticated-api',
		'write-nested-data',
		'filter-contextual-relations',
		'generate-types',
		'test-an-application',
	],
	'1.0.0/operations': [
		'configuration-and-environment',
		'secrets',
		'production-checklist',
		'application-troubleshooting',
	],
	'1.0.0/reference': [
		'core-api',
		'package-index',
		'compatibility',
		'architecture-decisions',
	],
	'1.0.0/reference/core-api': ['application', 'query', 'models', 'errors'],
} as const satisfies Readonly<Record<string, readonly string[]>>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null
}

describe('documentation navigation architecture', () => {
	it('matches the complete canonical navigation recorded by the milestone', async () => {
		for (const [directory, expectedPages] of Object.entries(
			canonicalNavigation,
		)) {
			const metadata: unknown = JSON.parse(
				await readFile(path.join(contentRoot, directory, 'meta.json'), 'utf8'),
			)
			expect(isRecord(metadata), directory).toBe(true)
			if (!isRecord(metadata))
				throw new TypeError(`Invalid metadata: ${directory}`)
			expect(metadata.pages, directory).toEqual(expectedPages)
		}
	})

	it('owns virtual-field documentation in Core without a duplicate guide', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/core/data-modeling/virtual-fields.mdx'),
			'utf8',
		)
		expect(page).toContain('contentType: concept')
		expect(page).toContain('## Selection and private dependencies')
		await expect(
			readFile(
				path.join(contentRoot, '1.0.0/guides/add-virtual-fields.mdx'),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('keeps field builder lookup inside Fields without a duplicate reference page', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/core/data-modeling/fields.mdx'),
			'utf8',
		)
		expect(page).toContain('## Built-in field builders')
		expect(page).toContain('Native JavaScript `bigint`')
		await expect(
			readFile(
				path.join(contentRoot, '1.0.0/reference/core-api/fields.mdx'),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' })
	})

	it('keeps schema declaration lookup inside Schemas without a duplicate reference page', async () => {
		const page = await readFile(
			path.join(contentRoot, '1.0.0/core/data-modeling/schemas.mdx'),
			'utf8',
		)
		for (const heading of [
			'## Declaration options',
			'### Indexes',
			'## Schema classes and application handles',
			'## Compilation errors',
		]) {
			expect(page).toContain(heading)
		}
		await expect(
			readFile(
				path.join(contentRoot, '1.0.0/reference/core-api/schema.mdx'),
				'utf8',
			),
		).rejects.toMatchObject({ code: 'ENOENT' })
	})
})
