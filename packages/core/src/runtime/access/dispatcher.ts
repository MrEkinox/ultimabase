import {
	FrameworkError,
	type FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import type {
	ExecutableOperationAst,
	OperationKind,
	QueryRelationFilterNode,
	QueryExpressionNode,
	UpdateExpressionNode,
} from '../../query/index.js'
import { applyUpdateExpressionToRecord } from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { isRelationUpdateExpression } from '../../schema/relations/mutation.js'
import {
	materializePreparedSchemaDraft,
	materializeSchemaModel,
} from '../../schema/schema/model.js'
import {
	combineAccessWhereResults,
	createAccessWhere,
} from '../../schema/access/filter.js'
import {
	getApplicationAccessPlan,
	type AccessPlan,
	type AccessRuleSource,
	type CompiledAccessRule,
	type FieldAccessPlan,
	type SchemaAccessPlan,
} from '../../schema/access/plan.js'
import type { FieldWriteAccessTransition } from '../../schema/access/field-declarations.js'
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
import {
	collectOperationFieldInputs,
	collectRecordFieldValues,
	readRuntimeFieldValuePath,
	type RuntimeFieldInputValue,
} from '../hooks/field-inputs.js'
import { getOperationSchema } from '../operations/schema.js'
import {
	readOperationQueries,
	readOperationResultSelection,
} from '../operations/queries.js'
import {
	readRuntimeIncludedPointerValue,
	transferRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import type {
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
} from '../pipeline/contracts.js'

type AccessPhase =
	| 'access-field-read'
	| 'access-field-write'
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
		case 'find-many':
		case 'find-one':
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
		case 'find-many':
		case 'find-one':
		case 'get':
			return undefined
	}
}

const collectFilterFields = (
	expression: QueryExpressionNode,
	fields: Set<string>,
): void => {
	const candidate: unknown = expression

	if (!isPlainRecord(candidate)) {
		return
	}

	// Collection fields cross a dedicated item boundary; pointer traversal still
	// uses the ordinary source field filter channel before target Access runs.
	if (candidate.kind === 'relation-predicate') {
		if (
			(candidate.operator === 'is' || candidate.operator === 'is-not') &&
			typeof candidate.field === 'string'
		) {
			fields.add(candidate.field)
		}

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
		appendUpdateFieldValues(values, update)
	}

	return values
}

/** Adds one exact update expression without conflating sibling bulk items. */
const appendUpdateFieldValues = (
	values: Map<string, unknown>,
	update: unknown,
): void => {
	if (!isPlainRecord(update) || !isUnknownArray(update.operations)) {
		return
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

const readExpressionUpdateFieldValues = (
	update: unknown,
): ReadonlyMap<string, unknown> => {
	const values = new Map<string, unknown>()

	appendUpdateFieldValues(values, update)

	return values
}

/** Applies one scalar update without pretending relation deltas are embedded values. */
const createUpdateCandidate = (
	schema: SchemaDefinition,
	update: UpdateExpressionNode,
	originalItem: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	isRelationUpdateExpression(update)
		? immutableRecord({ ...originalItem })
		: applyUpdateExpressionToRecord(schema, originalItem, update)

interface AffectedFieldValuePair {
	readonly field: FieldAccessPlan
	readonly originalValue: unknown
	readonly value: unknown
}

type RecordFieldValue = ReturnType<typeof collectRecordFieldValues>[number]

const pathsEqual = (
	left: readonly (number | string)[],
	right: readonly (number | string)[],
): boolean =>
	left.length === right.length &&
	left.every((segment, index) => segment === right[index])

/** Correlates concrete nested values, including removed list items, by value path. */
const collectAffectedFieldValuePairs = (
	schemaPlan: SchemaAccessPlan,
	originalValues: readonly RecordFieldValue[],
	values: readonly RecordFieldValue[],
	rootFieldName: string,
): readonly AffectedFieldValuePair[] => {
	const pairs: AffectedFieldValuePair[] = []

	for (const field of schemaPlan.fields) {
		if (field.path[0] !== rootFieldName || field.field.kind === 'relation') {
			continue
		}

		const originalByPath = new Map(
			originalValues
				.filter(({ fieldPath }) => pathsEqual(fieldPath, field.path))
				.map((entry) => [JSON.stringify(entry.valuePath), entry] as const),
		)
		const valueByPath = new Map(
			values
				.filter(({ fieldPath }) => pathsEqual(fieldPath, field.path))
				.map((entry) => [JSON.stringify(entry.valuePath), entry] as const),
		)
		const valuePaths = new Set([
			...originalByPath.keys(),
			...valueByPath.keys(),
		])

		for (const valuePath of valuePaths) {
			pairs.push(
				immutableRecord({
					field,
					originalValue: originalByPath.get(valuePath)?.value ?? null,
					value: valueByPath.get(valuePath)?.value ?? null,
				}),
			)
		}
	}

	return immutableArray(pairs)
}

/** Evaluates only callback rules after a locked target can produce final values. */
const evaluatePreparedUpdateFieldRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	schemaPlan: SchemaAccessPlan,
	defaultFieldDecision: boolean,
	originalItem: Readonly<Record<string, unknown>>,
	item: Readonly<Record<string, unknown>>,
	updateFields?: ReadonlyMap<string, unknown>,
): Promise<void> => {
	const operation = request.operation as unknown as ExecutableOperationAst
	const originalValues = collectRecordFieldValues(
		schemaPlan.schema.fields,
		originalItem,
		'parent-first',
	)
	const values = collectRecordFieldValues(
		schemaPlan.schema.fields,
		item,
		'parent-first',
	)

	for (const [fieldName] of updateFields ?? readUpdateFieldValues(operation)) {
		for (const {
			field,
			originalValue,
			value,
		} of collectAffectedFieldValuePairs(
			schemaPlan,
			originalValues,
			values,
			fieldName,
		)) {
			const transition: FieldWriteAccessTransition =
				value === null ? 'clear' : originalValue === null ? 'fill' : 'replace'
			const rules = field.write[transition]
			const input =
				transition === 'clear'
					? immutableRecord({
							context: request.context,
							originalValue,
						})
					: transition === 'fill'
						? immutableRecord({ context: request.context, value })
						: immutableRecord({
								context: request.context,
								originalValue,
								value,
							})

			await assertDecisionRules(
				runtime,
				request,
				rules,
				{
					branch: transition,
					field,
					phase: 'access-field-write',
					schema: schemaPlan.schema,
				},
				input,
				rules.length === 0 ? defaultFieldDecision : true,
			)
		}
	}
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
				immutableRecord({ context: request.context }),
				plan.defaults.field,
			)
		}
	}
}

const evaluateCreateFillRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	inputs: readonly RuntimeFieldInputValue[],
): Promise<void> => {
	for (const input of inputs) {
		if (input.mode !== 'create' || input.value === null) continue

		const field = plan.getField(schemaPlan.schema, input.fieldPath)

		if (field?.field !== input.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent create target',
			)
		}

		await assertDecisionRules(
			runtime,
			request,
			field.write.fill,
			{
				branch: 'fill',
				field,
				phase: 'access-field-write',
				schema: schemaPlan.schema,
			},
			immutableRecord({
				context: request.context,
				value: input.value,
			}),
			plan.defaults.field,
		)
	}
}

const evaluateRelationWriteRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	updateFields: ReadonlyMap<string, unknown>,
): Promise<void> => {
	for (const [fieldName, change] of updateFields) {
		const fields = schemaPlan.fields.filter(({ path }) => path[0] === fieldName)

		for (const field of fields) {
			if (field.field.kind !== 'relation') continue

			await assertDecisionRules(
				runtime,
				request,
				field.relationWrite,
				{
					branch: 'write',
					field,
					phase: 'access-field-write',
					schema: schemaPlan.schema,
				},
				immutableRecord({ change, context: request.context }),
				field.relationWrite.length === 0 ? plan.defaults.field : true,
			)
		}
	}
}

/** Determines whether one transition map has the same static result for every value state. */
const readStaticWriteDecision = (
	field: FieldAccessPlan,
	request?: RuntimeOperationStageInput<DatabaseOperationAst>,
): boolean | undefined => {
	const decisions: boolean[] = []

	for (const transition of ['fill', 'replace', 'clear'] as const) {
		const rules =
			request === undefined
				? field.write[transition]
				: getEffectiveRules(field.write[transition], request.context)

		if (rules.some(({ rule }) => typeof rule === 'function')) {
			return undefined
		}

		decisions.push(!rules.some(({ rule }) => rule === false))
	}

	const [decision] = decisions

	return decision !== undefined &&
		decisions.every((value) => value === decision)
		? decision
		: undefined
}

const evaluateMutationFieldRules = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<void> => {
	const operation = request.operation as unknown as ExecutableOperationAst
	const inputs = collectOperationFieldInputs(request.operation, 'parent-first')

	await evaluateCreateFillRules(
		runtime,
		request,
		plan,
		schemaPlan,
		inputs.filter(
			(input) => input.kind !== 'upsert-one' && input.kind !== 'upsert-many',
		),
	)

	if (operation.kind === 'upsert-one' || operation.kind === 'upsert-many') {
		return
	}

	for (const input of inputs) {
		if (input.mode !== 'update' || input.field.kind === 'relation') continue

		const field = plan.getField(schemaPlan.schema, input.fieldPath)

		if (field?.field !== input.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent update target',
			)
		}

		if (Object.values(field.write).every((rules) => rules.length === 0)) {
			await assertDecisionRules(
				runtime,
				request,
				[],
				{
					branch: 'write',
					field,
					phase: 'access-field-write',
					schema: schemaPlan.schema,
				},
				immutableRecord({ context: request.context }),
				plan.defaults.field,
			)
			continue
		}

		const staticDecision = readStaticWriteDecision(field, request)

		if (staticDecision === false) {
			await assertDecisionRules(
				runtime,
				request,
				Object.values(field.write).flat(),
				{
					branch: 'write',
					field,
					phase: 'access-field-write',
					schema: schemaPlan.schema,
				},
				immutableRecord({ context: request.context }),
				true,
			)
		}
	}

	await evaluateRelationWriteRules(
		runtime,
		request,
		plan,
		schemaPlan,
		readUpdateFieldValues(operation),
	)
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
		immutableRecord({ context: request.context }),
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
		const result = await evaluateRule(
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
				where: createAccessWhere(schemaPlan.schema),
			}),
		)

		if (result !== undefined) {
			results.push(result)
		}
	}

	return results.length === 0
		? state
		: appendEnforcementRowFilter(
				state,
				combineAccessWhereResults(schemaPlan.schema, results),
			)
}

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
			immutableRecord({ context: request.context }),
			true,
		)
		return
	}

	const inputs =
		operation.kind === 'create-one' ? [operation.input] : operation.inputs

	for (const input of inputs) {
		const item = materializePreparedSchemaDraft(schemaPlan.schema, input)

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
				item,
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
	const topLevel = schemaPlan.fields.filter((field) => {
		if (field.path.length !== 1) return false

		const [fieldName] = field.path
		const definition =
			fieldName === undefined ? undefined : schemaPlan.schema.fields[fieldName]

		// Relations remain Access-controlled handles but never become row projections.
		return definition?.kind !== 'relation'
	})
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

	for (const { field: fieldName } of readOperationResultSelection(operation)
		.fields) {
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

/** Omits one concrete property without ever changing surrounding list cardinality. */
const removeConcreteFieldPath = (
	value: unknown,
	path: readonly (number | string)[],
): unknown => {
	const [segment, ...tail] = path

	if (segment === undefined) {
		throw new TypeError('Native Access cannot omit an empty field path')
	}

	if (typeof segment === 'number') {
		if (
			!isUnknownArray(value) ||
			segment >= value.length ||
			tail.length === 0
		) {
			throw new TypeError(
				'Native Access cannot omit an invalid list field path',
			)
		}

		const items = [...value]
		items[segment] = removeConcreteFieldPath(items[segment], tail)

		return immutableArray(items)
	}

	if (!isPlainRecord(value) || !Object.hasOwn(value, segment)) {
		throw new TypeError('Native Access cannot omit an unavailable field path')
	}

	if (tail.length === 0) {
		return immutableRecord(
			Object.fromEntries(
				Object.entries(value).filter(([key]) => key !== segment),
			),
		)
	}

	return immutableRecord({
		...value,
		[segment]: removeConcreteFieldPath(value[segment], tail),
	})
}

const enforceRecordOutput = async (
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<DatabaseOperationAst>,
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
	record: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>>> => {
	let projected = record
	const values = collectRecordFieldValues(
		schemaPlan.schema.fields,
		record,
		'parent-first',
	)

	for (const value of values) {
		const field = plan.getField(schemaPlan.schema, value.fieldPath)

		if (field?.field !== value.field) {
			throw new TypeError(
				'Native Access field traversal resolved an inconsistent read target',
			)
		}

		if (field.field.kind === 'relation') {
			// Relation collections are absent from persisted rows. Their source rule is
			// enforced once before eager traversal, before an adapter can load targets.
			continue
		}

		const current = readRuntimeFieldValuePath(projected, value.valuePath)

		// A denied parent makes every originally collected descendant unavailable.
		if (!current.found) {
			continue
		}
		const retained = pathsEqual(value.fieldPath, value.valuePath)
			? readRuntimeIncludedPointerValue(projected, field.path)
			: undefined
		const accessValue =
			retained?.present === true ? retained.value : current.value

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
					context: request.context,
					value: accessValue,
				}),
				plan.defaults.field,
			)
		} catch (error: unknown) {
			if (
				error instanceof FrameworkError &&
				error.code === 'PERMISSION_DENIED'
			) {
				const next = removeConcreteFieldPath(projected, value.valuePath)

				if (!isPlainRecord(next)) {
					throw new TypeError(
						'Native Access field projection must preserve its root record',
						{ cause: error },
					)
				}

				transferRuntimeSchemaModelMetadata(projected, next)
				projected = next
				continue
			}

			throw error
		}
	}

	return projected
}

const enforceOutput = async <
	const TOperation extends DatabaseOperationAst,
	const TResult,
>(
	runtime: HookExecutionRuntime,
	request: RuntimeOperationStageInput<TOperation> & {
		readonly result: TResult
	},
	plan: AccessPlan,
	schemaPlan: SchemaAccessPlan,
): Promise<TResult> => {
	const unknownResult: unknown = request.result
	const operationInput = immutableRecord({
		context: request.context,
		operation: request.operation,
	})

	if (unknownResult === null || typeof unknownResult !== 'object') {
		return request.result
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

		return immutableArray(results) as TResult
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
	) as TResult
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
		await evaluateCreateItems(this.#runtime, request, schemaPlan)

		return state
	}

	/** Enforces one relation source field that is intentionally absent from row output. */
	async enforceRelationRead(
		request: RuntimeRelationEnforcementStageInput,
	): Promise<void> {
		return this.#enforceRelationFieldRead(
			request,
			request.relation.source,
			request.relation.fieldPath,
		)
	}

	/** Enforces relationship traversal declared directly inside one public where filter. */
	async enforceRelationPredicateRead(
		request: RuntimeOperationStageInput<DatabaseOperationAst>,
		predicate: QueryRelationFilterNode,
	): Promise<void> {
		const sourceField = predicate.source.definition.fields[predicate.field]

		if (sourceField?.kind === 'pointer') {
			return
		}

		return this.#enforceRelationFieldRead(
			request,
			predicate.source.definition,
			[predicate.field],
		)
	}

	async #enforceRelationFieldRead(
		request: RuntimeOperationStageInput<DatabaseOperationAst>,
		source: SchemaDefinition,
		fieldPath: readonly string[],
	): Promise<void> {
		const field = this.#plan.getField(source, fieldPath)

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
				schema: source,
			},
			immutableRecord({ context: request.context }),
			this.#plan.defaults.field,
		)
	}

	/** Requests set-based preimages only when a configured rule needs item values. */
	requiresPreparedMutationItems(
		operation: DatabaseMutationOperationAst,
	): boolean {
		if (operation.kind !== 'update-many' && operation.kind !== 'delete-many') {
			return false
		}

		const schemaPlan = this.#plan.getSchema(readSchema(operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		if (operation.kind === 'delete-many') {
			return schemaPlan.item.delete.length > 0
		}

		if (schemaPlan.item.update.length > 0) {
			return true
		}

		return collectOperationFieldInputs(operation, 'parent-first').some(
			(input) => {
				if (input.mode !== 'update' || input.field.kind === 'relation') {
					return false
				}

				const field = this.#plan.getField(schemaPlan.schema, input.fieldPath)

				return (
					field?.field === input.field &&
					readStaticWriteDecision(field) === undefined
				)
			},
		)
	}

	async enforcePreparedMutation<
		const TOperation extends DatabaseMutationOperationAst,
	>(request: RuntimePreparedMutationStageInput<TOperation>): Promise<void> {
		const setBased =
			request.operation.kind === 'update-many' ||
			request.operation.kind === 'delete-many'

		if (
			(request.target === undefined &&
				(!setBased || request.targets === undefined)) ||
			(request.operation.kind !== 'update-one' &&
				request.operation.kind !== 'update-many' &&
				request.operation.kind !== 'delete-one' &&
				request.operation.kind !== 'delete-many' &&
				request.operation.kind !== 'upsert-one')
		) {
			return
		}
		if (request.target === null && request.operation.kind !== 'upsert-one') {
			return
		}

		const schemaPlan = this.#plan.getSchema(readSchema(request.operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		const operation = request.operation as unknown as ExecutableOperationAst

		if (
			(operation.kind === 'update-many' || operation.kind === 'delete-many') &&
			request.targets !== undefined
		) {
			for (const target of request.targets) {
				const originalItem = materializeSchemaModel(schemaPlan.schema, target)

				if (operation.kind === 'delete-many') {
					await assertDecisionRules(
						this.#runtime,
						request,
						schemaPlan.item.delete,
						{
							branch: 'delete',
							phase: 'access-item',
							schema: schemaPlan.schema,
						},
						immutableRecord({ context: request.context, originalItem }),
						true,
					)
					continue
				}

				const candidate = createUpdateCandidate(
					schemaPlan.schema,
					operation.update,
					target,
				)

				await evaluatePreparedUpdateFieldRules(
					this.#runtime,
					request,
					schemaPlan,
					this.#plan.defaults.field,
					target,
					candidate,
				)
				await assertDecisionRules(
					this.#runtime,
					request,
					schemaPlan.item.update,
					{
						branch: 'update',
						phase: 'access-item',
						schema: schemaPlan.schema,
					},
					immutableRecord({
						context: request.context,
						item: candidate,
						originalItem,
					}),
					true,
				)
			}

			return
		}

		if (request.target === undefined) {
			throw new TypeError(
				'Native Access singular mutation requires a prepared target',
			)
		}

		const family =
			request.operation.kind === 'update-one'
				? 'update'
				: request.operation.kind === 'delete-one'
					? 'delete'
					: 'upsert'
		const upsertUpdate = family === 'upsert' && request.target !== null
		let item: object | null
		let originalItem: object | null

		if (request.target === null) {
			if (operation.kind !== 'upsert-one') {
				throw new TypeError(
					'Native Access missing target is valid only for an upsert create branch',
				)
			}

			item = materializePreparedSchemaDraft(schemaPlan.schema, operation.create)
			originalItem = null
			await evaluateCreateFillRules(
				this.#runtime,
				request,
				this.#plan,
				schemaPlan,
				collectOperationFieldInputs(request.operation, 'parent-first').filter(
					(input) => input.mode === 'create',
				),
			)
		} else {
			originalItem = materializeSchemaModel(schemaPlan.schema, request.target)

			if (operation.kind === 'delete-one') {
				item = null
			} else if (
				operation.kind === 'update-one' ||
				operation.kind === 'upsert-one'
			) {
				const candidate = createUpdateCandidate(
					schemaPlan.schema,
					operation.update,
					request.target,
				)
				item = candidate
				if (operation.kind === 'upsert-one') {
					await evaluateRelationWriteRules(
						this.#runtime,
						request,
						this.#plan,
						schemaPlan,
						readExpressionUpdateFieldValues(operation.update),
					)
				}
				await evaluatePreparedUpdateFieldRules(
					this.#runtime,
					request,
					schemaPlan,
					this.#plan.defaults.field,
					request.target,
					candidate,
				)
			} else {
				throw new TypeError(
					'Native Access received an invalid prepared mutation',
				)
			}
		}

		await assertDecisionRules(
			this.#runtime,
			request,
			schemaPlan.item[family],
			{
				branch: family,
				phase: 'access-item',
				schema: schemaPlan.schema,
			},
			family === 'delete'
				? immutableRecord({ context: request.context, originalItem })
				: immutableRecord({
						context: request.context,
						item,
						originalItem,
						...(family === 'upsert'
							? {
									mode: upsertUpdate
										? ('update' as const)
										: ('create' as const),
								}
							: {}),
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
		const fieldInputs = collectOperationFieldInputs(
			request.operation,
			'parent-first',
		)
		type UpsertMaterialization =
			| Readonly<{
					kind: 'create'
					current: Readonly<Record<string, unknown>>
			  }>
			| Readonly<{
					kind: 'update'
					current: Readonly<Record<string, unknown>>
					previous: Readonly<Record<string, unknown>>
			  }>
		const materializations = request.outcome
			.materializations as unknown as readonly UpsertMaterialization[]

		for (const [index, materialization] of materializations.entries()) {
			const item = items[index]

			if (item === undefined) {
				throw new TypeError(
					'Native Access received an unmatched upsert outcome',
				)
			}

			const update = materialization.kind === 'update'
			const accessItem = update
				? materialization.current
				: materializePreparedSchemaDraft(
						schemaPlan.schema,
						materialization.current,
					)
			const originalItem = update
				? materializeSchemaModel(schemaPlan.schema, materialization.previous)
				: null

			if (update) {
				await evaluateRelationWriteRules(
					this.#runtime,
					request,
					this.#plan,
					schemaPlan,
					readExpressionUpdateFieldValues(item.update),
				)
				await evaluatePreparedUpdateFieldRules(
					this.#runtime,
					request,
					schemaPlan,
					this.#plan.defaults.field,
					materialization.previous,
					materialization.current,
					readExpressionUpdateFieldValues(item.update),
				)
			} else {
				await evaluateCreateFillRules(
					this.#runtime,
					request,
					this.#plan,
					schemaPlan,
					fieldInputs.filter(
						(input) => input.mode === 'create' && input.itemIndex === index,
					),
				)
			}
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
					item: accessItem,
					mode: update ? ('update' as const) : ('create' as const),
					originalItem,
				}),
				true,
			)
		}

		return request.outcome
	}

	async enforceOutput<
		const TOperation extends DatabaseOperationAst,
		const TResult,
	>(
		request: RuntimeOperationStageInput<TOperation> & {
			readonly result: TResult
		},
	): Promise<TResult> {
		const schemaPlan = this.#plan.getSchema(readSchema(request.operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		return enforceOutput(this.#runtime, request, this.#plan, schemaPlan)
	}
}
