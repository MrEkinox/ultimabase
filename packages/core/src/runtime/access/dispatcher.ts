import {
	FrameworkError,
	type FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import type {
	ExecutableOperationAst,
	OperationKind,
	QueryAst,
	QueryExpressionNode,
} from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	combineAccessFilterResults,
	createAccessFilter,
} from '../../schema/access/filter.js'
import {
	getApplicationAccessPlan,
	type AccessPlan,
	type AccessRuleSource,
	type CompiledAccessRule,
	type FieldAccessPlan,
	type SchemaAccessPlan,
} from '../../schema/access/plan.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	DatabaseOperationResult,
} from '../database/contracts.js'
import {
	appendEnforcementRowFilter,
	narrowEnforcementFields,
	type EnforcementState,
} from '../enforcement/state.js'
import {
	applicationHookOwner,
	createFieldHookTarget,
	createHookExecutionDescriptor,
	createPluginHookOwner,
	createSchemaHookTarget,
	type HookExecutionDescriptor,
} from '../hooks/execution-descriptor.js'
import type { HookExecutionRuntime } from '../hooks/execution-runtime.js'
import { getApplicationHookExecutionRuntime } from '../hooks/execution-runtime.js'
import { getOperationSchema } from '../operations/schema.js'
import {
	isNonAtomicBulkOperation,
	readNonAtomicBulkResult,
} from '../operations/non-atomic-result.js'
import type {
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
} from '../pipeline/contracts.js'

type AccessPhase =
	| 'access-field-create'
	| 'access-field-read'
	| 'access-field-update'
	| 'access-filter'
	| 'access-item'
	| 'access-operation'

interface AccessRuleIdentity {
	readonly branch: string
	readonly field?: FieldAccessPlan
	readonly phase: AccessPhase
	readonly rule: CompiledAccessRule
	readonly ruleIndex: number
	readonly schema: SchemaDefinition
}

/** Keeps public denials stable while trusted diagnostics retain only static identity. */
const createAccessDeniedError = (
	phase: AccessPhase,
	operation: OperationKind,
	field?: FieldAccessPlan,
): FrameworkError<'PERMISSION_DENIED'> =>
	new FrameworkError('PERMISSION_DENIED', `Native Access denied ${phase}.`, {
		publicMessage: 'The operation is not permitted.',
		internalDetails: {
			...(field === undefined ? {} : { fieldPath: immutableArray(field.path) }),
			kind: 'native-access-denied',
			operation,
			phase,
		},
	})

/** Reports a missing itemized terminal without silently loading an unbounded set. */
const createItemizedCapabilityError = (
	operation: OperationKind,
): FrameworkError<'INTERNAL_ERROR'> =>
	new FrameworkError(
		'INTERNAL_ERROR',
		`Native Access item rules cannot protect set-based terminal ${operation}.`,
		{
			publicMessage:
				'This operation is unavailable with the configured access rules.',
			internalDetails: {
				kind: 'native-access-itemized-terminal-required',
				operation,
			},
		},
	)

const readSchema = (operation: DatabaseOperationAst): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Native Access requires a schema definition')
	}

	return schema
}

const shouldBypassMaster = (
	source: AccessRuleSource,
	context: RuntimeOperationStageInput<DatabaseOperationAst>['context'],
): boolean =>
	source.kind === 'plugin' &&
	source.master === 'bypass' &&
	context.access.mode === 'master'

const createRuleDescriptor = (
	identity: AccessRuleIdentity,
	operation: OperationKind,
): HookExecutionDescriptor => {
	const { rule, schema } = identity
	const owner =
		rule.source.kind === 'developer'
			? applicationHookOwner
			: createPluginHookOwner(rule.source.ownerPlugin, rule.source.localName)
	const target =
		identity.field === undefined
			? createSchemaHookTarget(schema.className)
			: createFieldHookTarget(schema.className, identity.field.path)

	return createHookExecutionDescriptor({
		declarationBranch: identity.branch,
		handler: typeof rule.rule === 'function' ? rule.rule : () => rule.rule,
		handlerIndex: identity.ruleIndex,
		operationKind: operation,
		owner,
		phase: identity.phase,
		target,
	})
}

/** Executes callbacks through the shared cancellation, recursion, and diagnostics boundary. */
const evaluateRule = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	identity: AccessRuleIdentity,
	input: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	if (typeof identity.rule.rule === 'boolean') {
		return identity.rule.rule
	}
	const handler = identity.rule.rule

	return runtime.invoke(
		createRuleDescriptor(identity, request.operation.kind),
		request.context,
		() => handler(input as never),
	)
}

const getEffectiveRules = (
	rules: readonly CompiledAccessRule[],
	context: RuntimeOperationStageInput<DatabaseOperationAst>['context'],
): readonly CompiledAccessRule[] =>
	immutableArray(
		rules.filter((rule) => !shouldBypassMaster(rule.source, context)),
	)

const assertDecisionRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	rules: readonly CompiledAccessRule[],
	identity: Omit<AccessRuleIdentity, 'rule' | 'ruleIndex'>,
	input: Readonly<Record<string, unknown>>,
	defaultDecision: boolean,
): Promise<void> => {
	const effective = getEffectiveRules(rules, request.context)

	if (rules.length === 0 && !defaultDecision) {
		throw createAccessDeniedError(
			identity.phase,
			request.operation.kind,
			identity.field,
		)
	}

	for (const [ruleIndex, rule] of effective.entries()) {
		const output = await evaluateRule(
			runtime,
			request,
			{ ...identity, rule, ruleIndex },
			input,
		)

		if (typeof output !== 'boolean') {
			throw new TypeError(
				`Native Access ${identity.phase} rule must return a boolean`,
			)
		}

		if (!output) {
			throw createAccessDeniedError(
				identity.phase,
				request.operation.kind,
				identity.field,
			)
		}
	}
}

const operationFilterFamily = (
	kind: OperationKind,
): keyof SchemaAccessPlan['filter'] | undefined => {
	switch (kind) {
		case 'count':
		case 'exists':
		case 'find':
		case 'first':
		case 'get':
			return 'read'
		case 'update-many':
		case 'update-one':
			return 'update'
		case 'upsert-many':
		case 'upsert-one':
			return 'upsert'
		case 'delete-many':
		case 'delete-one':
			return 'delete'
		case 'create-many':
		case 'create-one':
			return undefined
	}
}

const operationItemFamily = (
	kind: OperationKind,
): keyof SchemaAccessPlan['item'] | undefined => {
	switch (kind) {
		case 'create-many':
		case 'create-one':
			return 'create'
		case 'update-many':
		case 'update-one':
			return 'update'
		case 'upsert-many':
		case 'upsert-one':
			return 'upsert'
		case 'delete-many':
		case 'delete-one':
			return 'delete'
		case 'count':
		case 'exists':
		case 'find':
		case 'first':
		case 'get':
			return undefined
	}
}

const readOperationQueries = (
	operation: ExecutableOperationAst,
): readonly QueryAst[] => {
	if ('query' in operation) {
		return immutableArray([operation.query])
	}

	return operation.kind === 'upsert-many'
		? immutableArray(operation.items.map(({ query }) => query))
		: immutableArray([])
}

const collectFilterFields = (
	expression: QueryExpressionNode,
	fields: Set<string>,
): void => {
	const candidate: unknown = expression

	if (!isPlainRecord(candidate)) {
		return
	}

	if (typeof candidate.field === 'string') {
		fields.add(candidate.field)
	}

	if (isUnknownArray(candidate.expressions)) {
		for (const child of candidate.expressions) {
			if (isPlainRecord(child) && typeof child.kind === 'string') {
				collectFilterFields(child as unknown as QueryExpressionNode, fields)
			}
		}
	}

	if (
		isPlainRecord(candidate.expression) &&
		typeof candidate.expression.kind === 'string'
	) {
		collectFilterFields(
			candidate.expression as unknown as QueryExpressionNode,
			fields,
		)
	}
}

const readPathValue = (
	record: unknown,
	path: readonly string[],
): Readonly<{ present: boolean; value: unknown }> => {
	let current: unknown = record

	for (const segment of path) {
		if (!isPlainRecord(current) || !Object.hasOwn(current, segment)) {
			return immutableRecord({ present: false, value: undefined })
		}

		current = current[segment]
	}

	return immutableRecord({ present: true, value: current })
}

const readUpdateFieldValues = (
	operation: ExecutableOperationAst,
): ReadonlyMap<string, unknown> => {
	const values = new Map<string, unknown>()
	const updates =
		operation.kind === 'update-one' || operation.kind === 'update-many'
			? [operation.update]
			: operation.kind === 'upsert-one'
				? [operation.update]
				: operation.kind === 'upsert-many'
					? operation.items.map(({ update }) => update)
					: []

	for (const update of updates) {
		if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
			continue
		}

		for (const fieldOperation of update.operations) {
			if (
				isPlainRecord(fieldOperation) &&
				typeof fieldOperation.field === 'string'
			) {
				values.set(fieldOperation.field, fieldOperation.value)
			}
		}
	}

	return values
}

/** Reconstructs the schema-shaped update input promised to item Access callbacks. */
const createItemUpdateInput = (
	update: unknown,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		throw new TypeError('Native Access requires a normalized update expression')
	}

	const entries: [string, unknown][] = []

	for (const operation of update.operations) {
		if (!isPlainRecord(operation) || typeof operation.field !== 'string') {
			throw new TypeError('Native Access received an invalid update operation')
		}

		entries.push([operation.field, operation.value])
	}

	return immutableRecord(Object.fromEntries(entries))
}

const evaluateFieldReferenceRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	const operation = request.operation as unknown as ExecutableOperationAst
	const filterFields = new Set<string>()
	const orderFields = new Set<string>()

	for (const query of readOperationQueries(operation)) {
		if (query.where !== undefined) {
			collectFilterFields(query.where.expression, filterFields)
		}
		for (const order of query.ordering.orders) {
			orderFields.add(order.field)
		}
	}

	for (const [channel, fields] of [
		['filter', filterFields],
		['order', orderFields],
	] as const) {
		for (const fieldName of fields) {
			const field = plan.getField(schemaPlan.schema, [fieldName])

			if (field === undefined) {
				continue
			}

			await assertDecisionRules(
				runtime,
				request,
				field.read[channel],
				{
					branch: channel,
					field,
					phase: 'access-field-read',
					schema: schemaPlan.schema,
				},
				immutableRecord({
					channel,
					context: request.context,
					kind: request.operation.kind,
				}),
				plan.defaults.field,
			)
		}
	}
}

const evaluateMutationFieldRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	const operation = request.operation as unknown as ExecutableOperationAst
	const createInputs =
		operation.kind === 'create-one'
			? [operation.input]
			: operation.kind === 'create-many'
				? operation.inputs
				: operation.kind === 'upsert-one'
					? [operation.create]
					: operation.kind === 'upsert-many'
						? operation.items.map(({ create }) => create)
						: []

	for (const field of schemaPlan.fields) {
		for (const input of createInputs) {
			const value = readPathValue(input, field.path)

			if (value.present) {
				await assertDecisionRules(
					runtime,
					request,
					field.create,
					{
						branch: 'create',
						field,
						phase: 'access-field-create',
						schema: schemaPlan.schema,
					},
					immutableRecord({
						context: request.context,
						kind: request.operation.kind,
						value: value.value,
					}),
					plan.defaults.field,
				)
			}
		}
	}

	for (const [fieldName, value] of readUpdateFieldValues(operation)) {
		const field = plan.getField(schemaPlan.schema, [fieldName])

		if (field !== undefined) {
			await assertDecisionRules(
				runtime,
				request,
				field.update,
				{
					branch: 'update',
					field,
					phase: 'access-field-update',
					schema: schemaPlan.schema,
				},
				immutableRecord({
					context: request.context,
					kind: request.operation.kind,
					value,
				}),
				plan.defaults.field,
			)
		}
	}
}

const evaluateOperationAndFilter = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	state: EnforcementState,
): Promise<EnforcementState> => {
	await assertDecisionRules(
		runtime,
		request,
		schemaPlan.operation[request.operation.kind],
		{
			branch: request.operation.kind,
			phase: 'access-operation',
			schema: schemaPlan.schema,
		},
		immutableRecord({ context: request.context, kind: request.operation.kind }),
		plan.defaults.operation,
	)

	const family = operationFilterFamily(request.operation.kind)

	if (family === undefined) {
		return state
	}

	const rules = schemaPlan.filter[family]
	const effective = getEffectiveRules(rules, request.context)
	const results: unknown[] = []

	for (const [ruleIndex, rule] of effective.entries()) {
		results.push(
			await evaluateRule(
				runtime,
				request,
				{
					branch: family,
					phase: 'access-filter',
					rule,
					ruleIndex,
					schema: schemaPlan.schema,
				},
				immutableRecord({
					context: request.context,
					filter: createAccessFilter(schemaPlan.schema),
				}),
			),
		)
	}

	return results.length === 0
		? state
		: appendEnforcementRowFilter(
				state,
				combineAccessFilterResults(schemaPlan.schema, results),
			)
}

const hasValueDependentRule = (
	rules: readonly CompiledAccessRule[],
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
): boolean =>
	getEffectiveRules(rules, request.context).some(
		({ rule }) => typeof rule === 'function',
	)

const evaluateCreateItems = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	const operation = request.operation as unknown as ExecutableOperationAst
	const family = operationItemFamily(operation.kind)

	if (family === undefined) {
		return
	}

	const rules = schemaPlan.item[family]

	if (
		(operation.kind === 'update-many' || operation.kind === 'delete-many') &&
		hasValueDependentRule(rules, request)
	) {
		throw createItemizedCapabilityError(operation.kind)
	}

	if (operation.kind !== 'create-one' && operation.kind !== 'create-many') {
		const directRules = rules.filter(({ rule }) => typeof rule === 'boolean')
		await assertDecisionRules(
			runtime,
			request,
			directRules,
			{
				branch: family,
				phase: 'access-item',
				schema: schemaPlan.schema,
			},
			immutableRecord({ context: request.context, kind: operation.kind }),
			true,
		)
		return
	}

	const inputs =
		operation.kind === 'create-one' ? [operation.input] : operation.inputs

	for (const input of inputs) {
		await assertDecisionRules(
			runtime,
			request,
			rules,
			{
				branch: 'create',
				phase: 'access-item',
				schema: schemaPlan.schema,
			},
			immutableRecord({
				context: request.context,
				input,
				item: input,
				kind: operation.kind,
				mode: 'create',
			}),
			true,
		)
	}
}

const computeStaticSelection = (
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): readonly string[] | undefined => {
	const topLevel = schemaPlan.fields.filter((field) => field.path.length === 1)
	const permitted = immutableArray(
		topLevel
			.filter((field) => {
				const effective = getEffectiveRules(field.read.item, request.context)

				if (field.read.item.length === 0) {
					return plan.defaults.field
				}

				return !effective.some(({ rule }) => rule === false)
			})
			.map(({ path }) => path[0])
			.filter((field): field is string => field !== undefined),
	)

	// Leaving select-all implicit preserves optional-field semantics when no rule narrows it.
	return permitted.length === topLevel.length ? undefined : permitted
}

const assertExplicitSelection = (
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	permitted: readonly string[] | undefined,
): void => {
	if (permitted === undefined) {
		return
	}

	const operation = request.operation as unknown as ExecutableOperationAst

	for (const query of readOperationQueries(operation)) {
		for (const { field: fieldName } of query.selection.fields) {
			if (!permitted.includes(fieldName)) {
				const field = plan.getField(schemaPlan.schema, [fieldName])
				throw createAccessDeniedError(
					'access-field-read',
					request.operation.kind,
					field,
				)
			}
		}
	}
}

const removePath = (
	record: Readonly<Record<string, unknown>>,
	path: readonly string[],
): Readonly<Record<string, unknown>> => {
	const [head, ...tail] = path

	if (head === undefined || !Object.hasOwn(record, head)) {
		return record
	}

	if (tail.length === 0) {
		return immutableRecord(
			Object.fromEntries(
				Object.entries(record).filter(([key]) => key !== head),
			),
		)
	}

	const child = record[head]

	if (!isPlainRecord(child)) {
		return record
	}

	return immutableRecord({ ...record, [head]: removePath(child, tail) })
}

const enforceRecordOutput = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	record: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
	let projected = record

	for (const field of schemaPlan.fields) {
		const current = readPathValue(projected, field.path)

		if (!current.present) {
			continue
		}

		try {
			await assertDecisionRules(
				runtime,
				request,
				field.read.item,
				{
					branch: 'item',
					field,
					phase: 'access-field-read',
					schema: schemaPlan.schema,
				},
				immutableRecord({
					channel: 'item',
					context: request.context,
					kind: request.operation.kind,
					value: current.value,
				}),
				plan.defaults.field,
			)
		} catch (error: unknown) {
			if (
				error instanceof FrameworkError &&
				error.code === 'PERMISSION_DENIED'
			) {
				projected = removePath(projected, field.path)
				continue
			}

			throw error
		}
	}

	return projected
}

const enforceOutput = async <const TOperation extends DatabaseOperationAst>(
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<TOperation> & {
		readonly result: unknown
	},
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<DatabaseOperationResult<TOperation>> => {
	const unknownResult: unknown = request.result
	const operationInput = immutableRecord({
		context: request.context,
		operation: request.operation,
	})

	if (unknownResult === null || typeof unknownResult !== 'object') {
		return request.result as DatabaseOperationResult<TOperation>
	}

	if (isNonAtomicBulkOperation(request.operation)) {
		const bulk = readNonAtomicBulkResult(unknownResult, 'Native Access result')
		const results: unknown[] = []

		for (const record of bulk.results) {
			results.push(
				isPlainRecord(record)
					? await enforceRecordOutput(
							runtime,
							operationInput,
							plan,
							schemaPlan,
							record,
						)
					: record,
			)
		}

		return (
			bulk.status === 'completed'
				? immutableRecord({
						results: immutableArray(results),
						status: 'completed',
					})
				: immutableRecord({
						error: bulk.error,
						failedIndex: bulk.failedIndex,
						results: immutableArray(results),
						status: 'stopped',
					})
		) as DatabaseOperationResult<TOperation>
	}

	if (isUnknownArray(unknownResult)) {
		const results: unknown[] = []

		for (const record of unknownResult) {
			results.push(
				isPlainRecord(record)
					? await enforceRecordOutput(
							runtime,
							operationInput,
							plan,
							schemaPlan,
							record,
						)
					: record,
			)
		}

		return immutableArray(results) as DatabaseOperationResult<TOperation>
	}

	return (
		isPlainRecord(unknownResult)
			? await enforceRecordOutput(
					runtime,
					operationInput,
					plan,
					schemaPlan,
					unknownResult,
				)
			: request.result
	) as DatabaseOperationResult<TOperation>
}

/** Executes one application's immutable native Access plan at Runtime boundaries. */
export class NativeAccessRuntime {
	readonly #plan: AccessPlan
	readonly #runtime: HookExecutionRuntime

	constructor(
		application: FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>,
	) {
		this.#plan = getApplicationAccessPlan(application)
		this.#runtime = getApplicationHookExecutionRuntime(application)
		Object.freeze(this)
	}

	async evaluate<const TOperation extends DatabaseOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
		state: EnforcementState,
	): Promise<EnforcementState> {
		const schemaPlan = this.#plan.getSchema(readSchema(request.operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		let next = await evaluateOperationAndFilter(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
			state,
		)
		await evaluateFieldReferenceRules(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
		)
		await evaluateMutationFieldRules(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
		)
		await evaluateCreateItems(this.#runtime, request, schemaPlan)

		const permitted = computeStaticSelection(request, this.#plan, schemaPlan)
		assertExplicitSelection(request, this.#plan, schemaPlan, permitted)
		if (permitted !== undefined) {
			next = narrowEnforcementFields(next, 'selection', permitted)
		}

		return next
	}

	async reevaluate<const TOperation extends DatabaseOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
		state: EnforcementState,
	): Promise<EnforcementState> {
		const schemaPlan = this.#plan.getSchema(readSchema(request.operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		await evaluateMutationFieldRules(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
		)

		return state
	}

	/** Enforces one relation source field that is intentionally absent from row output. */
	async enforceRelationRead(
		request: RuntimeRelationEnforcementStageInput,
	): Promise<void> {
		const field = this.#plan.getField(
			request.relation.source,
			request.relation.fieldPath,
		)

		if (field?.field.kind !== 'relation') {
			throw new TypeError('Native Access relation field is unavailable')
		}

		await assertDecisionRules(
			this.#runtime,
			request,
			field.read.item,
			{
				branch: 'item',
				field,
				phase: 'access-field-read',
				schema: request.relation.source,
			},
			immutableRecord({
				context: request.context,
				kind: request.operation.kind,
			}),
			this.#plan.defaults.field,
		)
	}

	async enforcePreparedMutation<
		const TOperation extends DatabaseMutationOperationAst,
	>(request: RuntimePreparedMutationStageInput<TOperation>): Promise<void> {
		if (
			request.target === undefined ||
			request.target === null ||
			(request.operation.kind !== 'update-one' &&
				request.operation.kind !== 'delete-one')
		) {
			return
		}

		const schemaPlan = this.#plan.getSchema(readSchema(request.operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		const family = request.operation.kind === 'update-one' ? 'update' : 'delete'
		const operation = request.operation as unknown as ExecutableOperationAst
		await assertDecisionRules(
			this.#runtime,
			request,
			schemaPlan.item[family],
			{
				branch: family,
				phase: 'access-item',
				schema: schemaPlan.schema,
			},
			immutableRecord({
				context: request.context,
				...(family === 'update' && operation.kind === 'update-one'
					? { input: createItemUpdateInput(operation.update) }
					: {}),
				item: request.target,
				kind: request.operation.kind,
				...(family === 'update' ? { mode: 'update' as const } : {}),
			}),
			true,
		)
	}

	async enforceMutationOutcome<
		const TOperation extends DatabaseMutationOperationAst,
	>(
		request: RuntimeMutationOutcomeStageInput<TOperation>,
	): Promise<DatabaseOperationOutcome<TOperation>> {
		if (
			request.operation.kind !== 'upsert-one' &&
			request.operation.kind !== 'upsert-many'
		) {
			return request.outcome
		}

		const schemaPlan = this.#plan.getSchema(readSchema(request.operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		const operation = request.operation as unknown as ExecutableOperationAst
		if (operation.kind !== 'upsert-one' && operation.kind !== 'upsert-many') {
			throw new TypeError('Native Access requires an upsert operation')
		}
		const items =
			operation.kind === 'upsert-one' ? [operation] : operation.items
		const materializations: readonly Readonly<{
			readonly kind: 'create' | 'update'
			readonly current: Readonly<Record<string, unknown>>
			readonly previous?: Readonly<Record<string, unknown>>
		}>[] = request.outcome.materializations as unknown as readonly Readonly<{
			readonly kind: 'create' | 'update'
			readonly current: Readonly<Record<string, unknown>>
			readonly previous?: Readonly<Record<string, unknown>>
		}>[]

		for (const [index, materialization] of materializations.entries()) {
			const item = items[index]

			if (item === undefined) {
				throw new TypeError(
					'Native Access received an unmatched upsert outcome',
				)
			}

			const update = materialization.kind === 'update'
			await assertDecisionRules(
				this.#runtime,
				request,
				schemaPlan.item.upsert,
				{
					branch: 'upsert',
					phase: 'access-item',
					schema: schemaPlan.schema,
				},
				immutableRecord({
					context: request.context,
					input: update ? createItemUpdateInput(item.update) : item.create,
					item: update
						? (materialization.previous ?? materialization.current)
						: materialization.current,
					kind: request.operation.kind,
					mode: update ? ('update' as const) : ('create' as const),
				}),
				true,
			)
		}

		return request.outcome
	}

	async enforceOutput<const TOperation extends DatabaseOperationAst>(
		request: RuntimeOperationStageInput<TOperation> & {
			readonly result: unknown
		},
	): Promise<DatabaseOperationResult<TOperation>> {
		const schemaPlan = this.#plan.getSchema(readSchema(request.operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		return enforceOutput(this.#runtime, request, this.#plan, schemaPlan)
	}
}
