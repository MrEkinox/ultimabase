export { createQueryAst } from './ast/factory.js'
export type {
	InitialQueryAst,
	QueryAst,
	QueryAstNode,
	QueryCursorPaginationNode,
	QueryExpressionNode,
	QueryFieldName,
	QueryIncludedFieldNode,
	QueryIncludedPointerNode,
	QueryIncludedRelationNode,
	QueryInclusionNode,
	QueryOffsetPaginationNode,
	QueryOrderingNode,
	QueryOrderDirection,
	QueryOrderNode,
	QueryPaginationNode,
	QuerySchemaNode,
	QuerySelectedFieldNode,
	QuerySelectionNode,
	QueryWhereNode,
} from './ast/contracts.js'
export { queryCursorVersion } from './cursor/contracts.js'
export type {
	QueryCursor,
	QueryCursorCodec,
	QueryCursorOrderValue,
	QueryCursorPayload,
} from './cursor/contracts.js'
export { QueryCursorError } from './cursor/error.js'
export type { QueryCursorErrorCode } from './cursor/error.js'
export { normalizeQueryCursorOrdering } from './cursor/ordering.js'
export {
	createQueryCursorPayload,
	sealQueryCursor,
	unsealQueryCursor,
} from './cursor/payload.js'
export type { QueryCursorValues } from './cursor/payload.js'
export { normalizeQueryOrdering } from './clauses/ordering.js'
export type { QueryOrderInput } from './clauses/ordering.js'
export {
	normalizeQueryCursorPagination,
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
} from './clauses/pagination.js'
export type {
	QueryCursorPaginationInput,
	QueryOffsetPaginationInput,
} from './clauses/pagination.js'
export { normalizeQuerySelection } from './clauses/selection.js'
export type { QuerySelectedField, QuerySelection } from './clauses/selection.js'
export { normalizeQueryInclusion } from './clauses/inclusion.js'
export type {
	QueryPointerFieldName,
	QueryIncludableFieldName,
	QueryInclusionAst,
	QueryInclusionInput,
	QueryInclusionTargetSchema,
	QueryPointerInclusionAst,
	QueryPointerInclusionInput,
	QueryPointerInclusionNode,
	QueryPointerTargetSchema,
	QueryRelationFieldName,
	QueryRelationInclusionInput,
	QueryRelationInclusionNode,
	QueryRelationTargetSchema,
} from './clauses/inclusion.js'
export { normalizeLogicalFilter } from './filters/logical.js'
export { fieldPath } from './filters/factory.js'
export type {
	QueryAndFilterNode,
	QueryConstantFilterNode,
	QueryFilterExpression,
	QueryFilterNode,
	QueryLogicalFilterKind,
	QueryLogicalFilterNode,
	QueryNotFilterNode,
	QueryOrFilterNode,
	QuerySchemaFilterLeaf,
} from './filters/logical.js'
export type {
	QueryComparisonFilterNode,
	QueryComparisonFilterOperator,
	QueryBuiltInFilterOperator,
	QueryEqualityFilterNode,
	QueryEqualityFilterOperator,
	QueryNullFilterNode,
	QueryFilterValue,
	QueryFilterFieldName,
	QueryFilterOperand,
	QueryFilterTarget,
	QueryFieldPath,
	QueryKeyFilterNode,
	QueryKeyFilterOperator,
	QueryKeysFilterNode,
	QueryJsonPathExpression,
	QueryJsonPathFilterNode,
	QueryJsonPathFilterOperator,
	QueryMembershipFilterNode,
	QueryMembershipFilterOperator,
	QueryPrimitiveFilterNode,
	QueryPrimitiveFilterOperator,
	QueryRangeFilterNode,
	QueryRangeFilterOperator,
	QueryRegexFilterNode,
	QueryRegexFlag,
	QueryRegexPattern,
	QueryStringFilterNode,
	QueryStringFilterOperator,
	QueryStructuralContainmentFilterNode,
	QueryStructuralContainmentFilterOperator,
} from './filters/primitive.js'
export { normalizeWhereInput, WhereBuilder } from './filters/where.js'
export type {
	WhereCallback,
	WhereInput,
	WhereLogicalKey,
	WhereSource,
} from './filters/where.js'
export {
	collectQueryRelationPredicates,
	isQueryRelationCountNode,
	isQueryRelationPredicateNode,
	queryRelationPredicateMaxDepth,
} from './filters/relation.js'
export type {
	QueryRelationCountForSchema,
	QueryRelationCountComparison,
	QueryRelationCountInput,
	QueryRelationCountNode,
	QueryRelationCountOperator,
	QueryRelationFilterForSchema,
	QueryRelationFilterNode,
	QueryRelationPredicateForSchema,
	QueryRelationPredicateNode,
	QueryRelationPredicateOperator,
	QueryRelationQuantifierOperator,
	QueryPointerPredicateForSchema,
	QueryPointerPredicateNode,
	QueryPointerPredicateOperator,
	QueryRelationshipPredicateNode,
} from './filters/relation.js'
export type {
	CountOperationAst,
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	ExecutableOperationAst,
	ExistsOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
	GetOperationAst,
	OperationAst,
	OperationAstNode,
	OperationIncludedField,
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- Public compatibility re-export remains intentionally deprecated.
	OperationIncludedPointer,
	OperationKind,
	OperationObjectId,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
	UpsertOperationItem,
	UniqueUpsertTargetNode,
} from './operations/contracts.js'
export type { QueryOperationExecutor } from './operations/executor.js'
export type { OperationOptions } from './operations/options.js'
export type {
	InferOperationRecordResult,
	InferOperationResult,
	InferOperationSourceRecordResult,
} from './operations/results.js'
export { normalizeUniqueUpsertTarget } from './operations/upsert.js'
export type {
	UpsertInput,
	UpsertManyItemInput,
	UpsertTargetQuery,
} from './operations/upsert.js'
export type {
	SchemaCreateManyInput,
	SchemaCreateOneInput,
	SchemaDeleteManyInput,
	SchemaDeleteOneInput,
	SchemaUpdateManyItemInput,
	SchemaUpdateManyInput,
	SchemaUpdateOneInput,
	SchemaUpsertOneInput,
	SchemaUpsertManyInput,
	SchemaUpsertManyItemInput,
	SchemaWhere,
	SchemaWhereFactory,
} from './operations/schema-commands.js'
export type {
	InferQueryRecord,
	InferQueryResult,
	QueryPointerResultInclusion,
	QueryRelationResultInclusion,
	QueryResultInclusion,
} from './query/result.js'
export type {
	CountInput,
	ExactReadInput,
	ExistsInput,
	FindManyInput,
	FindOneInput,
	GetInput,
	QueryIncludeInput,
	QueryIncludedFieldFromInput,
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- Public compatibility re-export remains intentionally deprecated.
	QueryIncludedPointerFromInput,
	QueryBuilderInput,
	QueryOrderByDirection,
	QueryOrderByInput,
	QueryPointerTargetInput,
	QueryRelationTargetInput,
	QuerySelectedFieldFromInput,
} from './query/input.js'
export type {
	GeneratedDeepPartial,
	GeneratedEqualityWhere,
	GeneratedJsonPathVariables,
	GeneratedJsonPathWhere,
	GeneratedNullableWhere,
	GeneratedOrderBy,
	GeneratedOrderedWhere,
	GeneratedPathWhere,
	GeneratedPointerInclude,
	GeneratedPointerWhere,
	GeneratedRelationCountWhere,
	GeneratedRelationInclude,
	GeneratedRelationWhere,
	GeneratedSelect,
	GeneratedStringWhere,
	GeneratedStructuralWhere,
	GeneratedWhere,
	GeneratedWhereBranches,
} from './generated-contracts.js'
export { QueryBuilder } from './query/query.js'
export type { QueryPointerTargetBuilder } from './query/query.js'
export type { QueryScope } from './query/scope.js'
export { normalizeUpdateExpression } from './updates/normalize.js'
export { applyUpdateExpressionToRecord } from './updates/apply.js'
export { decrement, increment, unset } from './updates/operators.js'
export type {
	DecrementUpdateValue,
	IncrementUpdateValue,
} from './updates/operators.js'
export type {
	DecrementUpdateOperationNode,
	IncrementUpdateOperationNode,
	NumericUpdateFieldName,
	NumericUpdateInput,
	SetUpdateOperationNode,
	UpdateExpression,
	UpdateExpressionInput,
	UpdateExpressionNode,
	UpdateFieldName,
	UpdateOperationNode,
	UpdateSetInput,
} from './updates/contracts.js'
