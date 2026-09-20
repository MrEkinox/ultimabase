import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FrameworkApplication } from '../../application/framework-application.js'
import { Schema } from '../../schema/schema/definition.js'
import { definePlugin } from '../definition.js'
import * as canonical from './canonical-compiler.js'

afterEach(() => vi.restoreAllMocks())

// Fault injection stays inside Core tests; application compilation always validates output.
const inspectCompiler = (
	compile: typeof canonical.compileCanonicalSchemaCompilerIr,
) =>
	vi
		.spyOn(canonical, 'compileCanonicalSchemaCompilerIr')
		.mockImplementation(compile)
const identityCompiler: typeof canonical.compileCanonicalSchemaCompilerIr = (
	input,
) =>
	immutableRecord({
		protocolVersion: input.protocolVersion,
		selections: immutableArray([]),
		schemas: immutableArray(input.schemas),
	})

describe('mandatory schema compiler validation', () => {
	it('rejects mutable or partial compiler output before setup', () => {
		const Target = Schema.define({
			className: 'MalformedReplacementTarget',
			fields: () => ({}),
		})
		inspectCompiler((input) => ({
			protocolVersion: input.protocolVersion,
			selections: [],
			schemas: [],
		}))
		let setupCalls = 0
		const setup = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.setup-after-compiler',
			version: '1.0.0',
			setup: () => {
				setupCalls += 1
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [setup],
			schemas: [Target],
		})

		expect(() => application.compileSchemas()).toThrow(
			'schema compiler output must be immutable',
		)
		expect(() => application.compileSchemas()).toThrow(
			'schema compiler output must be immutable',
		)
		expect(setupCalls).toBe(0)
	})

	it('keeps compiler inputs isolated across applications', () => {
		const compiledClassNames: string[][] = []
		inspectCompiler((input) => {
			compiledClassNames.push(input.schemas.map(({ className }) => className))
			return identityCompiler(input)
		})
		const First = Schema.define({
			className: 'CompilerIsolationFirst',
			fields: () => ({}),
		})
		const Second = Schema.define({
			className: 'CompilerIsolationSecond',
			fields: () => ({}),
		})
		const first = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [First],
		})
		const second = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [Second],
		})

		first.compileSchemas()
		second.compileSchemas()

		expect(compiledClassNames).toStrictEqual([
			['CompilerIsolationFirst'],
			['CompilerIsolationSecond'],
		])
	})

	it('rejects removal of protected Core fields and inconsistent provenance', () => {
		const Target = Schema.define({
			className: 'ProtectedCompilerTarget',
			fields: (field) => ({ title: field.string() }),
		})
		inspectCompiler((input) =>
			immutableRecord({
				protocolVersion: input.protocolVersion,
				selections: immutableArray([]),
				schemas: immutableArray(
					input.schemas.map((schema) =>
						immutableRecord({
							...schema,
							fields: immutableArray(
								schema.fields.filter(({ name }) => name !== 'id'),
							),
							provenance: immutableRecord({
								...schema.provenance,
								fields: immutableRecord(
									Object.fromEntries(
										Object.entries(schema.provenance.fields).filter(
											([name]) => name !== 'id',
										),
									),
								),
							}),
						}),
					),
				),
			}),
		)
		const protectedApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [Target],
		})
		expect(() => protectedApplication.compileSchemas()).toThrow(
			'changed protected Core field: ProtectedCompilerTarget.id',
		)

		inspectCompiler((input) => {
			const [schema] = input.schemas
			if (schema === undefined) return identityCompiler(input)
			return immutableRecord({
				protocolVersion: input.protocolVersion,
				selections: immutableArray([]),
				schemas: immutableArray([
					immutableRecord({
						...schema,
						provenance: immutableRecord({
							...schema.provenance,
							fields: immutableRecord({}),
						}),
					}),
				]),
			})
		})
		const InconsistentTarget = Schema.define({
			className: 'InconsistentCompilerTarget',
			fields: () => ({}),
		})
		const inconsistentApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [InconsistentTarget],
		})
		expect(() => inconsistentApplication.compileSchemas()).toThrow(
			'provenance.fields must match schema fields',
		)
	})
})
