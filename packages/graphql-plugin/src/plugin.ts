import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
	applicationOperationTransportPlanningCapability,
	applicationRequestExecutionCapability,
	databaseFilterOperatorsCapability,
	type ApplicationOperationTransportPlanner,
	type OperationTransportProtocol,
} from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideCapability,
	requireCapability,
	type PluginDeclarationContribution,
	type PluginInstance,
	type PluginSchemaOptionSource,
	type PluginSchemaRulesSource,
	provideSchemaRules,
} from '@ultimabase/core/plugin'
import {
	readDeploymentEnvironment,
	readExposurePlan,
} from '@ultimabase/plugin-kit'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	bindGraphqlOperationTransport,
	bindGraphqlSchemaMutationTransport,
	createGraphqlApplicationResource,
	graphqlApplicationCapability,
	readGraphqlApplicationFacts,
	type GraphqlApplication,
} from './application.js'
import { compileGraphqlSchema } from './compiler.js'
import { GraphqlConnectionRuntime } from './connection-runtime.js'
import { assertGraphqlPublicWrites } from './exposure.js'
import { GraphqlGeneratedExecution } from './generated-execution.js'
import {
	graphqlValidationRules,
	type GraphqlDisabledFieldHints,
} from './hints.js'
import { GraphqlNetworklessExecution } from './networkless-execution.js'
import { GraphqlOperationExecution } from './operation-execution.js'
import {
	parseGraphqlPluginOptions,
	type GraphqlPluginOptions,
} from './options.js'
import { graphqlOperationProtocol, graphqlProtocol } from './protocol.js'
import { graphqlSchemaOption, type GraphqlSchemaRules } from './rules.js'
import { composeGraphqlSchemas } from './schema-composition.js'
import { graphqlSchemaContributionsCapability } from './schema-contributions.js'
import { GraphqlSchemaMutationExecution } from './schema-mutation-execution.js'
import { assertNoPluginOwnedGraphqlRule } from './surfaces.js'

/** Exposes the application-local network-independent GraphQL schema. */
export type GraphqlPluginExports = GraphqlApplication

const requestExecutionRequirement = requireCapability(
	applicationRequestExecutionCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)
const operationPlanningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
	{ phase: 'materialization' },
)
const graphqlApplicationRequirement = requireCapability(
	graphqlApplicationCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const optionalSchemaContributions = optionalCapability(
	graphqlSchemaContributionsCapability,
	'^1.0.0',
)
// Filter inputs list only the adapter's declared operators (ADR-0325).
const optionalFilterOperators = optionalCapability(
	databaseFilterOperatorsCapability,
	'^1.0.0',
)

// The schema option projects nothing: `.with({ graphql: … })` types it (ADR-0325).
type GraphqlOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-graphql-schema-option'
	readonly schema: Readonly<{ graphql: typeof graphqlSchemaOption }>
}>

/** Names the sole GraphQL v1 owner for one application. */
export type GraphqlPlugin = PluginInstance<{
	readonly id: '@ultimabase/graphql-plugin'
	readonly exports: GraphqlPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly environment: readonly ['environment:filesystem'] | undefined
	readonly source: PluginSchemaRulesSource<GraphqlSchemaRules>
}>

const noHints: GraphqlDisabledFieldHints = new Map()

/** Installs generated GraphQL schema execution without selecting an HTTP adapter. */
export const graphqlPlugin = (
	options: GraphqlPluginOptions = {},
): GraphqlPlugin => {
	const normalized = parseGraphqlPluginOptions(options)
	// Hints name schemas and methods a client cannot use, so they are given
	// outside production only, like Access's 'development' openings
	// (ADR-0312, ADR-0333).
	const hinted = readDeploymentEnvironment() !== 'production'
	// Core decides what GraphQL serves (ADR-0347); GraphQL lays out the roots.
	const readPlan = <const TTransport extends OperationTransportProtocol>(
		planner: ApplicationOperationTransportPlanner,
		transport: TTransport,
		hide: boolean,
	) =>
		readExposurePlan(planner, {
			factory: 'graphqlPlugin',
			label: 'GraphQL',
			// `hide` names public operations, which bind to the operation protocol.
			options: hide
				? normalized.exposure
				: { ...normalized.exposure, hide: immutableArray([]) },
			schemaKey: 'graphql',
			transport,
		})
	const applicationProvider = provideCapability(graphqlApplicationCapability, {
		contributionId: 'official-graphql-application',
		create: ({ callbacks, capabilities: reader, logger, owner, schemas }) => {
			const connections = new GraphqlConnectionRuntime(normalized.limits)
			const planner = reader.get(operationPlanningRequirement)
			assertNoPluginOwnedGraphqlRule(schemas)
			// Every public operation is exposed unless hidden (ADR-0324, F1).
			const operationPlan = readPlan(planner, graphqlOperationProtocol, true)
			// Generated roots and plugin commands bind to the GraphQL protocol.
			const exposurePlan = readPlan(planner, graphqlProtocol, false)
			const operations = new GraphqlOperationExecution(operationPlan)
			const schemaMutationPlan = planner.planSchemaMutations({
				bindings: 'optional',
				transport: graphqlProtocol,
			})
			const schemaMutations = new GraphqlSchemaMutationExecution(
				schemaMutationPlan,
			)
			try {
				const execution = new GraphqlGeneratedExecution({
					callbacks,
					connections,
					executor: reader.get(requestExecutionRequirement),
					logger,
					operations,
					owner,
					schemaMutations,
				})
				const filterOperators = reader.get(optionalFilterOperators)
				const generated = compileGraphqlSchema({
					connectionLimits: normalized.limits,
					execution,
					exposurePlan,
					...(filterOperators === undefined ? {} : { filterOperators }),
					operationPlan,
					schemaMutationPlan,
					schemaMutations,
					schemas,
				})
				const contributed = reader.contributions(optionalSchemaContributions)
				// Generated roots first, then application schemas, then plugin contributions.
				const schema = composeGraphqlSchemas({
					callbacks,
					logger,
					schemas: [
						{
							attribution: { kind: 'generated', owner, pluginVersion: '0.0.0' },
							description: 'generated GraphQL schema',
							schema: generated.schema,
						},
						...normalized.schemas.map((custom, index) => ({
							attribution: { kind: 'application' as const },
							description: `application schema[${String(index)}]`,
							schema: custom,
						})),
						...contributed.flatMap((contribution) =>
							contribution.value.map((custom, index) => ({
								attribution: {
									kind: 'plugin' as const,
									owner: contribution.owner,
									pluginVersion: contribution.pluginVersion,
								},
								description: `plugin ${contribution.owner.pluginId}${contribution.owner.instanceId === undefined ? '' : `#${contribution.owner.instanceId}`} contribution ${contribution.contributionId}[${String(index)}]`,
								schema: custom,
							})),
						),
					],
				})
				const validationRules = graphqlValidationRules(
					hinted ? generated.hints : noHints,
				)
				const networkless = new GraphqlNetworklessExecution({
					callbacks,
					executor: reader.get(requestExecutionRequirement),
					limits: normalized.limits,
					logger,
					owner,
					schema,
					validationRules,
				})
				return createGraphqlApplicationResource({
					connections,
					facts: immutableRecord({
						exposed:
							generated.exposed ||
							normalized.schemas.length > 0 ||
							contributed.some(({ value }) => value.length > 0),
						operations: immutableArray(
							operationPlan.operations.map(({ name }) => name),
						),
						writes: generated.writes,
					}),
					networkless,
					operations,
					schema,
					schemaMutations,
					validationRules,
				})
			} catch (error: unknown) {
				connections.dispose()
				operations.dispose()
				schemaMutations.dispose()
				throw error
			}
		},
	})
	const declarations: PluginDeclarationContribution<
		readonly [],
		GraphqlOptionSource
	> = contributeDeclarations({
		schema: ({ schemas }) =>
			schemas.defineOptions({
				contributionId: 'official-graphql-schema-option',
				schema: { graphql: graphqlSchemaOption },
			}),
	})
	const application = contributeApplication(({ capabilities, logger }) => {
		const exports = capabilities.get(graphqlApplicationRequirement)
		const facts = readGraphqlApplicationFacts(exports)
		if (!facts.exposed) {
			logger.warn(
				'GraphQL exposes no schema or operation, only its health field: register application schemas in new App({ schemas }), or install a plugin or defineOperation() that declares public operations.',
			)
		}
		return {
			exports,
			startTransports: async () => {
				const executor = capabilities.get(requestExecutionRequirement)
				assertGraphqlPublicWrites(
					facts.writes,
					executor.hasProtectedPolicy(),
					normalized.exposure.publicWrites,
				)
				if (facts.operations.length > 0) {
					bindGraphqlOperationTransport(
						exports,
						executor.exposeOperations({
							operations: facts.operations,
							transport: graphqlOperationProtocol,
						}),
					)
				}
				bindGraphqlSchemaMutationTransport(
					exports,
					executor.exposeSchemaMutations({
						bindings: 'optional',
						transport: graphqlProtocol,
					}),
				)
				if (normalized.sdl !== undefined) {
					// For graphql-codegen or gql.tada (ADR-0325).
					const path = resolve(normalized.sdl)
					await writeFile(path, `${exports.printSchema()}\n`, 'utf8')
					logger.debug(`GraphQL SDL written to ${path}`)
				}
			},
		}
	})
	// `.with({ graphql: { … } })` (ADR-0339).
	return provideSchemaRules<GraphqlPlugin>(
		plugin({
			id: '@ultimabase/graphql-plugin',
			version: '0.0.0',
			core: '^0.0.0',
			contributions: [
				optionalSchemaContributions,
				optionalFilterOperators,
				applicationProvider,
				requestExecutionRequirement,
				operationPlanningRequirement,
				graphqlApplicationRequirement,
				declarations,
				application,
			],
			...(normalized.sdl === undefined
				? {}
				: { environment: ['environment:filesystem'] as const }),
		}),
		['graphql'],
	)
}
