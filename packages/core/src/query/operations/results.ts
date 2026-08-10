import type {
	SchemaItem,
	SchemaDefinition,
	SchemaResult,
} from '../../schema/index.js'

import type { QueryExpressionNode, QueryFieldName } from '../ast/contracts.js'
import type { UpdateExpressionNode } from '../updates/contracts.js'
import type {
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	FindManyOperationAst,
	FindOneOperationAst,
	GetOperationAst,
	OperationAstNode,
	OperationIncludedField,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from './contracts.js'
import type { QueryRecord, QueryResult } from '../query/result.js'

type OperationResultMode = 'model' | 'record'
type OperationInclusionMode = 'hydrated' | 'pointer'

type QueryObjectResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TMode extends OperationResultMode,
	TIncludedPointer,
	TInclusionMode extends OperationInclusionMode,
> = TMode extends 'model'
	? QueryResult<TSchema, TSelectedField, TIncludedPointer>
	: QueryRecord<
			TSchema,
			TSelectedField,
			TInclusionMode extends 'hydrated' ? TIncludedPointer : never
		>

type CompleteObjectResult<
	TSchema extends SchemaDefinition,
	TMode extends OperationResultMode,
> = TMode extends 'model' ? SchemaResult<TSchema> : SchemaItem<TSchema>

/** Maps every terminal to either its neutral Runtime record or public model result. */
type OperationResultFor<
	TOperation extends OperationAstNode,
	TMode extends OperationResultMode,
	TInclusionMode extends OperationInclusionMode,
> =
	TOperation extends FindManyOperationAst<
		infer TSchema,
		QueryExpressionNode,
		infer TSelectedField,
		unknown
	>
		? readonly QueryObjectResult<
				TSchema,
				TSelectedField,
				TMode,
				OperationIncludedField<TOperation>,
				TInclusionMode
			>[]
		: TOperation extends FindOneOperationAst<
					infer TSchema,
					QueryExpressionNode,
					infer TSelectedField,
					unknown
			  >
			? QueryObjectResult<
					TSchema,
					TSelectedField,
					TMode,
					OperationIncludedField<TOperation>,
					TInclusionMode
				> | null
			: TOperation extends GetOperationAst<
						infer TSchema,
						QueryExpressionNode,
						infer TSelectedField,
						unknown
				  >
				? QueryObjectResult<
						TSchema,
						TSelectedField,
						TMode,
						OperationIncludedField<TOperation>,
						TInclusionMode
					>
				: TOperation extends { readonly kind: 'count' }
					? number
					: TOperation extends { readonly kind: 'exists' }
						? boolean
						: TOperation extends CreateOneOperationAst<
									infer TSchema,
									infer TSelectedField
							  >
							? [TSelectedField] extends [never]
								? CompleteObjectResult<TSchema, TMode>
								: QueryObjectResult<
										TSchema,
										TSelectedField,
										TMode,
										never,
										TInclusionMode
									>
							: TOperation extends CreateManyOperationAst<
										infer TSchema,
										infer TSelectedField
								  >
								? readonly ([TSelectedField] extends [never]
										? CompleteObjectResult<TSchema, TMode>
										: QueryObjectResult<
												TSchema,
												TSelectedField,
												TMode,
												never,
												TInclusionMode
											>)[]
								: TOperation extends UpdateOneOperationAst<
											infer TSchema,
											UpdateExpressionNode,
											QueryExpressionNode,
											infer TSelectedField,
											unknown
									  >
									? QueryObjectResult<
											TSchema,
											TSelectedField,
											TMode,
											OperationIncludedField<TOperation>,
											TInclusionMode
										> | null
									: TOperation extends UpdateManyOperationAst<
												infer TSchema,
												UpdateExpressionNode,
												QueryExpressionNode,
												infer TSelectedField
										  >
										? readonly QueryObjectResult<
												TSchema,
												TSelectedField,
												TMode,
												never,
												TInclusionMode
											>[]
										: TOperation extends UpsertOneOperationAst<
													infer TSchema,
													UpdateExpressionNode,
													QueryExpressionNode,
													infer TSelectedField,
													unknown
											  >
											? QueryObjectResult<
													TSchema,
													TSelectedField,
													TMode,
													OperationIncludedField<TOperation>,
													TInclusionMode
												>
											: TOperation extends UpsertManyOperationAst<
														infer TSchema,
														UpdateExpressionNode,
														QueryExpressionNode,
														infer TSelectedField
												  >
												? readonly ([TSelectedField] extends [never]
														? CompleteObjectResult<TSchema, TMode>
														: QueryObjectResult<
																TSchema,
																TSelectedField,
																TMode,
																never,
																TInclusionMode
															>)[]
												: TOperation extends DeleteOneOperationAst<
															infer TSchema,
															QueryExpressionNode,
															infer TSelectedField,
															unknown
													  >
													? QueryObjectResult<
															TSchema,
															TSelectedField,
															TMode,
															OperationIncludedField<TOperation>,
															TInclusionMode
														> | null
													: TOperation extends DeleteManyOperationAst<
																infer TSchema,
																QueryExpressionNode,
																infer TSelectedField
														  >
														? readonly QueryObjectResult<
																TSchema,
																TSelectedField,
																TMode,
																never,
																TInclusionMode
															>[]
														: never

/** Maps every normalized terminal intent to its exact public model result. */
export type OperationResult<TOperation extends OperationAstNode> =
	OperationResultFor<TOperation, 'model', 'hydrated'>

/** Maps every normalized terminal to its exact hydrated Runtime record. */
export type OperationRecordResult<TOperation extends OperationAstNode> =
	OperationResultFor<TOperation, 'record', 'hydrated'>

/** Maps every normalized terminal to the adapter record before pointer hydration. */
export type OperationSourceRecordResult<TOperation extends OperationAstNode> =
	OperationResultFor<TOperation, 'record', 'pointer'>
