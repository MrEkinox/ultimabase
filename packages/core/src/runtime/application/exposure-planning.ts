import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { recordExposurePlanning } from '../../application/exposure-warning.js'
import {
	nativeCommandKeys,
	readCommandKeyDecision,
	readSchemaCommandCatalog,
	type CommandCatalogEntry,
} from '../../plugins/command-catalog.js'
import type { CompiledCommandGraph } from '../../plugins/command-graph.js'
import {
	readSchemaExposeRule,
	type NormalizedExposureRule,
} from '../../plugins/exposure-rules.js'
import {
	formatPluginIdentity,
	isSamePluginIdentity,
	type PluginIdentity,
} from '../../plugins/manifest.js'
import { readSchemaCommandClosure } from '../../schema/schema/command-closures.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import {
	projectPublicOperationTransports,
	projectSchemaMutationTransports,
} from '../commands/transport-projection.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type { ExposedSchemaMutationTransportBinding } from '../schema-mutations/transport.js'
import {
	exposurePlanningSignature,
	parseExposurePlanningOptions,
	type ApplicationExposurePlan,
	type ExposedSchemaMethod,
	type ExposedSchemaPlan,
	type ExposurePlanningOptions,
	type ParsedExposurePlanningOptions,
} from './exposure-planning-options.js'

interface CachedPlan {
	readonly owner: PluginIdentity
	readonly signature: string
	readonly plan: ApplicationExposurePlan
}

const plans = new WeakMap<
	object,
	Map<OperationTransportProtocol, CachedPlan[]>
>()

/** Reads the transport's own rule of a schema; other value shapes decide nothing. */
const readTransportRule = (
	schema: SchemaDefinition,
	schemaKey: string,
): NormalizedExposureRule | undefined => {
	if (!Object.hasOwn(schema.definition, schemaKey)) return undefined
	const stored: unknown = Reflect.get(schema.definition, schemaKey)
	if (typeof stored === 'boolean') return stored
	if (!isPlainRecord(stored)) return undefined
	return immutableRecord(
		Object.fromEntries(
			Object.entries(stored).filter(
				(entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
			),
		),
	)
}

/** Requires every value of the key to be defined by the calling plugin. */
const assertKeyOwner = (
	schema: SchemaDefinition,
	schemaKey: string,
	owner: PluginIdentity,
): void => {
	const { options } = schema.provenance
	if (!Object.hasOwn(options, schemaKey)) return
	const definer = options[schemaKey]?.definition.owner
	if (definer?.kind !== 'plugin' || !isSamePluginIdentity(definer, owner)) {
		throw new TypeError(
			`exposure planning schemaKey ${schemaKey} is not defined by plugin "${formatPluginIdentity(owner)}"`,
		)
	}
}

type RuleSource = 'default' | 'expose' | 'transport'

interface Decision {
	readonly key: string | undefined
	readonly source: RuleSource
	readonly value: boolean
}

const decideBy = (
	rule: NormalizedExposureRule | undefined,
	entry: CommandCatalogEntry,
	source: RuleSource,
): Decision | undefined => {
	if (rule === undefined) return undefined
	if (typeof rule === 'boolean') return { key: undefined, source, value: rule }
	const decision = readCommandKeyDecision(rule, entry)
	return decision === undefined ? undefined : { ...decision, source }
}

interface SchemaRules {
	readonly transport: NormalizedExposureRule | undefined
	readonly expose: NormalizedExposureRule | undefined
	readonly default: NormalizedExposureRule | undefined
}

const decide = (
	rules: SchemaRules,
	entry: CommandCatalogEntry,
): Decision | undefined =>
	decideBy(rules.transport, entry, 'transport') ??
	decideBy(rules.expose, entry, 'expose') ??
	decideBy(rules.default, entry, 'default')

/** Refuses a record key that names nothing this schema serves. */
const assertKnownKeys = (
	rule: NormalizedExposureRule | undefined,
	source: string,
	className: string,
	pluginKeys: ReadonlySet<string>,
): void => {
	if (typeof rule !== 'object') return
	for (const key of Object.keys(rule)) {
		if (nativeCommandKeys.includes(key) || pluginKeys.has(key)) continue
		const known = [...pluginKeys].sort()
		throw new TypeError(
			`${source}.${key} on ${className} names no schema method or exposable command${known.length === 0 ? '' : `; its commands are ${known.join(', ')}`}`,
		)
	}
}

const closureRemoval = (
	decision: Decision,
	method: string,
	className: string,
	options: ParsedExposurePlanningOptions<OperationTransportProtocol>,
): string =>
	decision.source === 'default'
		? `Remove ${method} from ${options.factory}({ default }), or set it to false in .with({ ${options.schemaKey} }) of ${className}.`
		: `Remove ${method} from .with({ ${decision.source === 'expose' ? 'expose' : options.schemaKey} }) of ${className}.`

/** Lists the methods a transport can serve for one schema, with their bindings. */
const servedMethods = (
	graph: CompiledCommandGraph,
	className: string,
	bindings: ReadonlyMap<string, ExposedSchemaMutationTransportBinding>,
): readonly ExposedSchemaMethod[] =>
	readSchemaCommandCatalog(graph, className).flatMap(
		(entry): ExposedSchemaMethod[] => {
			if (entry.kind === 'native') return [{ entry, kind: 'native' }]
			const binding = bindings.get(`${className}.${entry.method}`)
			return entry.authority === 'request' &&
				entry.cardinality === 'one' &&
				binding !== undefined
				? [{ binding, entry, kind: 'plugin' }]
				: []
		},
	)

const planSchema = (
	graph: CompiledCommandGraph,
	schema: SchemaDefinition,
	bindings: ReadonlyMap<string, ExposedSchemaMutationTransportBinding>,
	options: ParsedExposurePlanningOptions<OperationTransportProtocol>,
): readonly ExposedSchemaMethod[] => {
	const { className } = schema
	const rules: SchemaRules = {
		default: options.default,
		expose: readSchemaExposeRule(schema),
		transport: readTransportRule(schema, options.schemaKey),
	}
	const served = servedMethods(graph, className, bindings)
	const pluginKeys = new Set(
		served.flatMap(({ entry }) =>
			entry.kind === 'plugin' ? [entry.operation, entry.method] : [],
		),
	)
	assertKnownKeys(rules.transport, options.schemaKey, className, pluginKeys)
	assertKnownKeys(rules.expose, 'expose', className, pluginKeys)
	return served.filter((method) => {
		const { entry } = method
		const decision = decide(rules, entry)
		const closure =
			entry.kind === 'native'
				? readSchemaCommandClosure(schema, entry.method)
				: undefined
		if (closure === undefined) {
			return (
				decision?.value ??
				(entry.kind === 'native' ? entry.defaultExposed : false)
			)
		}
		// A closed method is never served; only a rule naming it is an error.
		if (decision?.value === true && decision.key === entry.method) {
			throw new TypeError(
				`${className}.${entry.method} is closed by plugin "${formatPluginIdentity(closure.owner)}": ${closure.reason} ${closureRemoval(decision, entry.method, className, options)}`,
			)
		}
		return false
	})
}

const compilePlan = <TTransport extends OperationTransportProtocol>(
	graph: CompiledCommandGraph,
	owner: PluginIdentity,
	options: ParsedExposurePlanningOptions<TTransport>,
): ApplicationExposurePlan<TTransport> => {
	const bindings = new Map(
		projectSchemaMutationTransports(graph, options.transport, 'optional')
			.filter(({ descriptor }) => descriptor.authority === 'request')
			.map(({ descriptor }) => [
				`${descriptor.schema}.${descriptor.command}`,
				descriptor,
			]),
	)
	const schemas: ExposedSchemaPlan[] = []
	for (const className of graph.schemaNames()) {
		const schema = graph.schemaSurface(className)?.schema
		if (schema === undefined) continue
		assertKeyOwner(schema, options.schemaKey, owner)
		const ownerKind = schema.provenance.schema.owner.kind
		if (ownerKind !== 'application') {
			const source = Object.hasOwn(schema.definition, options.schemaKey)
				? options.schemaKey
				: readSchemaExposeRule(schema) === undefined
					? undefined
					: 'expose'
			// Storage ownership never becomes public exposure.
			if (ownerKind === 'plugin' && source !== undefined) {
				throw new TypeError(
					`Plugin-owned schema "${className}" cannot declare .with({ ${source} }): transports expose application schemas only`,
				)
			}
			continue
		}
		const methods = planSchema(graph, schema, bindings, options)
		if (methods.length > 0) {
			schemas.push(
				immutableRecord({ className, methods: immutableArray(methods) }),
			)
		}
	}
	const operations = projectPublicOperationTransports(graph, options.transport)
	for (const hidden of options.hide) {
		if (!operations.some(({ name }) => name === hidden.name)) {
			throw new TypeError(
				`${options.factory}({ hide }) lists ${hidden.name}, which ${options.label} does not expose: it is not a public operation, or its owner binds it to other transports only`,
			)
		}
	}
	const hidden = new Set(options.hide.map(({ name }) => name))
	return immutableRecord({
		operations: immutableArray(
			operations.filter(({ name }) => !hidden.has(name)),
		),
		schemas: immutableArray(schemas),
		transport: options.transport,
		writes: immutableArray(
			schemas.flatMap(({ className, methods }) =>
				methods
					.filter(({ entry }) => entry.group === 'write')
					.map((method) => immutableRecord({ method, schema: className })),
			),
		),
	})
}

/** Cached plans are keyed by their exact protocol object. */
const isPlanFor = <TTransport extends OperationTransportProtocol>(
	plan: ApplicationExposurePlan,
	transport: TTransport,
): plan is ApplicationExposurePlan<TTransport> => plan.transport === transport

/**
 * @internal Compiles one transport's exposure plan on its first request and
 * returns the same plan for the same options afterwards (ADR-0347).
 */
export const planApplicationExposure = <
	TTransport extends OperationTransportProtocol,
>(
	application: object,
	owner: PluginIdentity,
	options: ExposurePlanningOptions<TTransport>,
): ApplicationExposurePlan<TTransport> => {
	recordExposurePlanning(application)
	const parsed = parseExposurePlanningOptions(options)
	const signature = exposurePlanningSignature(parsed)
	let byProtocol = plans.get(application)
	if (byProtocol === undefined) {
		byProtocol = new Map()
		plans.set(application, byProtocol)
	}
	const cached = byProtocol.get(parsed.transport) ?? []
	const previous = cached.find((entry) =>
		isSamePluginIdentity(entry.owner, owner),
	)
	if (previous !== undefined) {
		if (previous.signature !== signature) {
			throw new TypeError(
				`Exposure plan for ${parsed.transport.name}@${parsed.transport.version} is already compiled with other options`,
			)
		}
		if (isPlanFor(previous.plan, parsed.transport)) return previous.plan
	}
	const plan = compilePlan(
		readApplicationKernelState(application).commands,
		owner,
		parsed,
	)
	byProtocol.set(parsed.transport, [...cached, { owner, plan, signature }])
	return plan
}

/** @internal Lists every plan compiled for one application, in planning order. */
export const readApplicationExposurePlans = (
	application: object,
): readonly ApplicationExposurePlan[] =>
	immutableArray(
		[...(plans.get(application)?.values() ?? [])].flatMap((cached) =>
			cached.map(({ plan }) => plan),
		),
	)
