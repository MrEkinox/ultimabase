import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import type {
	SchemaCompilerInput,
	SchemaCompilerSchemaNode,
} from './contracts.js'
import { schemaCompilerProtocolVersion } from './contracts.js'
import { SchemaCompilerArtifactSession } from './artifacts.js'
import {
	assertSchemaCompilerInput,
	assertSchemaCompilerOutput,
} from './validation.js'
import {
	applicationSchemaContributionOwner,
	createInitialSchemaProvenance,
} from '../../schema/schema/provenance.js'

const createSchemaNode = (
	session: SchemaCompilerArtifactSession,
	artifactId: string,
	className: string,
): SchemaCompilerSchemaNode =>
	immutableRecord({
		artifact: session.reference('schema', artifactId, () => className),
		className,
		constraints: immutableArray([]),
		developerFieldNames: immutableArray([]),
		extensions: immutableArray([]),
		fields: immutableArray([]),
		indexes: immutableArray([]),
		options: immutableArray([]),
		provenance: createInitialSchemaProvenance(
			className,
			[],
			immutableRecord({}),
			[],
			[],
			[],
		),
	})

const createInput = (
	session: SchemaCompilerArtifactSession,
): SchemaCompilerInput =>
	immutableRecord({
		declarations: immutableArray([
			immutableRecord({
				additions: immutableArray([
					immutableRecord({
						contributionId: 'plugin-post',
						schema: createSchemaNode(
							session,
							'schema:plugin-post',
							'PluginPost',
						),
						staticOptions: immutableRecord({ source: 'fixture' }),
					}),
				]),
				optionDefinitions: immutableArray([]),
				order: 0,
				owner: immutableRecord({
					kind: 'plugin' as const,
					pluginId: 'fixture.compiler-ir',
					version: '1.0.0',
				}),
				patches: immutableArray([]),
				selections: immutableArray([]),
			}),
		]),
		protocolVersion: schemaCompilerProtocolVersion,
		schemas: immutableArray([
			createSchemaNode(session, 'schema:developer-post', 'Post'),
		]),
	})

describe('schema compiler IR validation', () => {
	it('accepts one complete immutable callback-free graph', () => {
		const session = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const output = immutableRecord({
			protocolVersion: schemaCompilerProtocolVersion,
			selections: immutableArray([]),
			schemas: immutableArray([
				...input.schemas,
				...input.declarations.flatMap(({ additions }) =>
					additions.map(({ schema }) => schema),
				),
			]),
		})

		expect(() => {
			assertSchemaCompilerInput(input, session)
		}).not.toThrow()
		expect(() => {
			assertSchemaCompilerOutput(input, output, session)
		}).not.toThrow()
		expect(JSON.stringify(input)).not.toContain('SchemaFixture')
	})

	it('rejects callbacks and mutable nested values', () => {
		const session = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const withCallback = Object.freeze({
			...input,
			compile: (): undefined => undefined,
		})
		const mutableSchemas = Object.freeze({
			...input,
			schemas: [...input.schemas],
		})

		expect(() => {
			assertSchemaCompilerInput(withCallback, session)
		}).toThrow('schema compiler input.compile must not contain callbacks')
		expect(() => {
			assertSchemaCompilerInput(mutableSchemas, session)
		}).toThrow('schema compiler input.schemas must be immutable')
	})

	it('rejects protocol 2 and malformed option-presence selectors', () => {
		const session = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const protocolTwo = immutableRecord({
			...input,
			protocolVersion: '2.0.0',
		})
		const declaration = input.declarations[0]
		if (declaration === undefined) {
			throw new TypeError('Missing fixture declaration')
		}
		const malformedSelector = immutableRecord({
			...input,
			declarations: immutableArray([
				immutableRecord({
					...declaration,
					selections: immutableArray([
						immutableRecord({
							selectionId: 'selection:malformed',
							selector: immutableRecord({
								option: immutableRecord({
									name: 'workflow',
									path: immutableArray(['enabled']),
								}),
							}),
						}),
					]),
				}),
			]),
		})

		expect(() => {
			assertSchemaCompilerInput(protocolTwo, session)
		}).toThrow('Unsupported schema compiler input protocol version')
		expect(() => {
			assertSchemaCompilerInput(malformedSelector, session)
		}).toThrow('Schema selector option.path requires option.equals')
	})

	it('rejects schema additions that omit their attribution facts', () => {
		const session = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const declaration = input.declarations[0]
		const addition = declaration?.additions[0]
		if (declaration === undefined || addition === undefined) {
			throw new TypeError('Missing fixture schema addition')
		}
		const unattributedAddition = immutableRecord({
			contributionId: addition.contributionId,
			schema: addition.schema,
		})
		const invalidInput = immutableRecord({
			...input,
			declarations: immutableArray([
				immutableRecord({
					...declaration,
					additions: immutableArray([unattributedAddition]),
				}),
			]),
		})

		expect(() => {
			assertSchemaCompilerInput(invalidInput, session)
		}).toThrow('staticOptions must be portable facts')
	})

	it('rejects forged and foreign application references', () => {
		const session = new SchemaCompilerArtifactSession()
		const foreignSession = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const foreign = createSchemaNode(
			foreignSession,
			'schema:foreign',
			'Foreign',
		)
		const forged = immutableRecord({
			artifactId: 'schema:forged',
			artifactKind: 'schema' as const,
			kind: 'schema-compiler-artifact' as const,
		})

		expect(() => {
			assertSchemaCompilerInput(
				immutableRecord({ ...input, schemas: immutableArray([foreign]) }),
				session,
			)
		}).toThrow('contains a foreign artifact reference')
		expect(session.owns(forged, 'schema')).toBe(false)
	})

	it('rejects partial, duplicate, and identity-changing output', () => {
		const session = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const developer = input.schemas[0]
		if (developer === undefined) throw new TypeError('Missing fixture schema')

		expect(() => {
			assertSchemaCompilerOutput(
				input,
				immutableRecord({
					protocolVersion: schemaCompilerProtocolVersion,
					selections: immutableArray([]),
					schemas: immutableArray([developer]),
				}),
				session,
			)
		}).toThrow('complete schema graph')

		expect(() => {
			assertSchemaCompilerOutput(
				input,
				immutableRecord({
					protocolVersion: schemaCompilerProtocolVersion,
					selections: immutableArray([]),
					schemas: immutableArray([developer, developer]),
				}),
				session,
			)
		}).toThrow('Duplicate schema compiler identity')

		const renamed = immutableRecord({ ...developer, className: 'RenamedPost' })
		expect(() => {
			assertSchemaCompilerOutput(
				input,
				immutableRecord({
					protocolVersion: schemaCompilerProtocolVersion,
					selections: immutableArray([]),
					schemas: immutableArray([
						renamed,
						...input.declarations.flatMap(({ additions }) =>
							additions.map(({ schema }) => schema),
						),
					]),
				}),
				session,
			)
		}).toThrow('changed stable schema identity')
	})

	it('rejects same-session artifacts that were absent from the compiler input', () => {
		const session = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const staleArtifact = session.reference(
			'schema',
			'schema:unexposed',
			() => 'unexposed',
		)
		const developer = input.schemas[0]
		if (developer === undefined) throw new TypeError('Missing fixture schema')
		const output = immutableRecord({
			protocolVersion: schemaCompilerProtocolVersion,
			selections: immutableArray([]),
			schemas: immutableArray([
				immutableRecord({ ...developer, artifact: staleArtifact }),
				...input.declarations.flatMap(({ additions }) =>
					additions.map(({ schema }) => schema),
				),
			]),
		})

		expect(() => {
			assertSchemaCompilerOutput(input, output, session)
		}).toThrow('contains a stale artifact reference')
	})

	it('rejects provenance owners that were absent from the compiler input', () => {
		const session = new SchemaCompilerArtifactSession()
		const input = createInput(session)
		const developer = input.schemas[0]
		if (developer === undefined) throw new TypeError('Missing fixture schema')
		const inventedSchemaProvenance = immutableRecord({
			...developer.provenance.schema,
			owner: immutableRecord({
				kind: 'plugin' as const,
				pluginId: 'invented.compiler',
				version: '1.0.0',
			}),
		})
		const output = immutableRecord({
			protocolVersion: schemaCompilerProtocolVersion,
			selections: immutableArray([]),
			schemas: immutableArray([
				immutableRecord({
					...developer,
					provenance: immutableRecord({
						...developer.provenance,
						schema: inventedSchemaProvenance,
					}),
				}),
				...input.declarations.flatMap(({ additions }) =>
					additions.map(({ schema }) => schema),
				),
			]),
		})

		expect(() => {
			assertSchemaCompilerOutput(input, output, session)
		}).toThrow('contains an owner absent from compiler input')
	})

	it('keeps application ownership as inert public provenance', () => {
		expect(applicationSchemaContributionOwner).toEqual({ kind: 'application' })
	})
})
