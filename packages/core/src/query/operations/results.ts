import type {
	InferObject,
	SchemaDefinition,
	SchemaResult,
} from '../../schema/index.js'

import type { QueryExpressionNode, QueryFieldName } from '../ast/contracts.js'
import type { UpdateExpressionNode } from '../updates/contracts.js'
import type {
	BulkOperationResult,
	CreateManyOperationAst,
	CreateOneOperationAst,
	DeleteManyOperationAst,
	DeleteOneOperationAst,
	FindOperationAst,
	FirstOperationAst,
	GetOperationAst,
	OperationAstNode,
	OperationIncludedPointer,
	UpdateManyOperationAst,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from './contracts.js'
import type { InferQueryRecord, InferQueryResult } from '../query/result.js'

type OperationResultMode = 'model' | 'record'
type OperationInclusionMode = 'hydrated' | 'pointer'

type QueryObjectResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TMode extends OperationResultMode,
	TIncludedPointer,
	TInclusionMode extends OperationInclusionMode,
> = TMode extends 'model'
	? InferQueryResult<TSchema, TSelectedField, TIncludedPointer>
	: InferQueryRecord<
			TSchema,
			TSelectedField,
			TInclusionMode extends 'hydrated' ? TIncludedPointer : never
		>

type CompleteObjectResult<
	TSchema extends SchemaDefinition,
	TMode extends OperationResultMode,
> = TMode extends 'model' ? SchemaResult<TSchema> : InferObject<TSchema>

/** Maps every terminal to either its neutral Runtime record or public model result. */
type InferOperationResultFor<
	TOperation extends OperationAstNode,
	TMode extends OperationResultMode,
	TInclusionMode extends OperationInclusionMode,
> =
	TOperation extends FindOperationAst<
		infer TSchema,
		QueryExpressionNode,
		infer TSelectedField,
		unknown
	>
		? readonly QueryObjectResult<
				TSchema,
				TSelectedField,
				TMode,
				OperationIncludedPointer<TOperation>,
				TInclusionMode
			>[]
		: TOperation extends FirstOperationAst<
					infer TSchema,
					QueryExpressionNode,
					infer TSelectedField,
					unknown
			  >
			? QueryObjectResult<
					TSchema,
					TSelectedField,
					TMode,
					OperationIncludedPointer<TOperation>,
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
						OperationIncludedPointer<TOperation>,
						TInclusionMode
					> | null
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
										infer TAtomic,
										infer TSelectedField
								  >
								? BulkOperationResult<
										[TSelectedField] extends [never]
											? CompleteObjectResult<TSchema, TMode>
											: QueryObjectResult<
													TSchema,
													TSelectedField,
													TMode,
													never,
													TInclusionMode
												>,
										TAtomic
									>
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
											OperationIncludedPointer<TOperation>,
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
													OperationIncludedPointer<TOperation>,
													TInclusionMode
												>
											: TOperation extends UpsertManyOperationAst<
														infer TSchema,
														UpdateExpressionNode,
														QueryExpressionNode,
														infer TAtomic,
														infer TSelectedField
												  >
												? BulkOperationResult<
														[TSelectedField] extends [never]
															? CompleteObjectResult<TSchema, TMode>
															: QueryObjectResult<
																	TSchema,
																	TSelectedField,
																	TMode,
																	never,
																	TInclusionMode
																>,
														TAtomic
													>
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
															OperationIncludedPointer<TOperation>,
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
export type InferOperationResult<TOperation extends OperationAstNode> =
	InferOperationResultFor<TOperation, 'model', 'hydrated'>

/** Maps every normalized terminal to its exact hydrated Runtime record. */
export type InferOperationRecordResult<TOperation extends OperationAstNode> =
	InferOperationResultFor<TOperation, 'record', 'hydrated'>

/** Maps every normalized terminal to the adapter record before pointer hydration. */
export type InferOperationSourceRecordResult<
	TOperation extends OperationAstNode,
> = InferOperationResultFor<TOperation, 'record', 'pointer'>
