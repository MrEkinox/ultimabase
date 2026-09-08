export { createQueryAst } from './ast/factory.js'
export type {
	InitialQueryAst,
	QueryAst,
	QueryAstNode,
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
export { normalizeQueryOrdering } from './clauses/ordering.js'
export type { QueryOrderInput } from './clauses/ordering.js'
export {
	normalizeQueryLimit,
	normalizeQueryOffsetPagination,
} from './clauses/pagination.js'
export type { QueryOffsetPaginationInput } from './clauses/pagination.js'
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
export { traverseQueryExpression } from './filters/traversal.js'
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
	QueryListEmptyFilterNode,
	QueryListFilterOperator,
	QueryListHasFilterNode,
	QueryListMembershipFilterNode,
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
export {
	normalizeWhereInput,
	resolveWhereInput,
	WhereBuilder,
} from './filters/where.js'
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
export { normalizeReadOperation } from './operations/read-normalization.js'
export type {
	ReadOperationAst,
	ReadOperationAstForKind,
	ReadOperationKind,
} from './operations/read-normalization.js'
export { runWithQueryExecutionGuard } from './operations/execution.js'
export type { QueryExecutionGuard } from './operations/execution.js'
export type { OperationOptions } from './operations/options.js'
export type {
	OperationRecordResult,
	OperationResult,
	OperationSourceRecordResult,
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
	SchemaWhereInput,
} from './operations/schema-commands.js'
export type {
	QueryRecord,
	QueryResult,
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
	QueryBuilderInput,
	QueryOrderByDirection,
	QueryOrderByInput,
	QueryPointerTargetInput,
	QueryRelationTargetInput,
	QuerySelectedFieldFromInput,
} from './query/input.js'
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
	NestedUpdateExpressionInput,
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
