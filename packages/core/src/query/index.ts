export { createQueryAst } from './ast/factory.js'
export type {
	InitialQueryAst,
	QueryAst,
	QueryAstNode,
	QueryCursorPaginationNode,
	QueryExpressionNode,
	QueryFieldName,
	QueryIncludedPointerNode,
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
export { normalizeQueryInclusion } from './clauses/inclusion.js'
export type {
	QueryPointerFieldName,
	QueryPointerInclusionAst,
	QueryPointerInclusionInput,
	QueryPointerInclusionNode,
	QueryPointerTargetSchema,
} from './clauses/inclusion.js'
export { normalizeLogicalFilter } from './filters/logical.js'
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
	QueryEqualityFilterNode,
	QueryEqualityFilterOperator,
	QueryExistenceFilterNode,
	QueryFilterValue,
	QueryFilterFieldName,
	QueryMembershipFilterNode,
	QueryMembershipFilterOperator,
	QueryPrimitiveFilterNode,
	QueryPrimitiveFilterOperator,
	QueryRegexFilterNode,
	QueryRegexFlag,
	QueryRegexPattern,
	QueryStringFilterNode,
	QueryStringFilterOperator,
} from './filters/primitive.js'
export {
	collectQueryRelationPredicates,
	isQueryRelationPredicateNode,
	queryRelationPredicateMaxDepth,
	RelationPredicate,
} from './filters/relation.js'
export type {
	QueryRelationPredicateForSchema,
	QueryRelationPredicateNode,
	QueryRelationPredicateOperator,
} from './filters/relation.js'
export type {
	AtomicBulkOperationOptions,
	BulkOperationResult,
	CountOperationAst,
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	ExecutableOperationAst,
	ExistsOperationAst,
	FindOperationAst,
	FirstOperationAst,
	GetOperationAst,
	OperationAst,
	OperationAstNode,
	OperationKind,
	OperationObjectId,
	NonAtomicBulkCompleted,
	NonAtomicBulkResult,
	NonAtomicBulkStopped,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
	UpsertOperationItem,
	UniqueUpsertTargetNode,
} from './operations/contracts.js'
export { normalizeBulkOperationOptions } from './operations/bulk.js'
export type { BulkOperationOptions } from './operations/bulk.js'
export type { QueryOperationExecutor } from './operations/executor.js'
export type {
	QueryAtomicBulkTerminalOptions,
	QueryBulkAtomic,
	QueryBulkTerminalOptions,
	QueryBulkTerminalResult,
	QueryNonAtomicBulkTerminalOptions,
	QueryTerminalOptions,
} from './operations/execution.js'
export type {
	InferOperationRecordResult,
	InferOperationResult,
} from './operations/results.js'
export { normalizeUniqueUpsertTarget } from './operations/upsert.js'
export type {
	UpsertInput,
	UpsertManyItemInput,
	UpsertTargetQuery,
} from './operations/upsert.js'
export type {
	InferQueryRecord,
	InferQueryResult,
	QueryPointerResultInclusion,
} from './query/result.js'
export { Query } from './query/query.js'
export type { QueryScope } from './query/scope.js'
export { normalizeUpdateExpression } from './updates/normalize.js'
export type {
	DecrementUpdateOperationNode,
	IncrementUpdateOperationNode,
	NumericUpdateFieldName,
	NumericUpdateInput,
	SetUpdateOperationNode,
	UnsetUpdateFieldName,
	UnsetUpdateOperationNode,
	UpdateExpression,
	UpdateExpressionInput,
	UpdateExpressionNode,
	UpdateFieldName,
	UpdateOperationNode,
	UpdateSetInput,
} from './updates/contracts.js'
