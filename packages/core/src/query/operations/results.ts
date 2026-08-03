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
	DeleteOneOperationAst,
	FindOperationAst,
	FirstOperationAst,
	GetOperationAst,
	OperationAstNode,
	UpdateOneOperationAst,
	UpsertManyOperationAst,
	UpsertOneOperationAst,
} from './contracts.js'
import type { InferQueryRecord, InferQueryResult } from '../query/result.js'

type OperationResultMode = 'model' | 'record'

type QueryObjectResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TMode extends OperationResultMode,
> = TMode extends 'model'
	? InferQueryResult<TSchema, TSelectedField>
	: InferQueryRecord<TSchema, TSelectedField>

type CompleteObjectResult<
	TSchema extends SchemaDefinition,
	TMode extends OperationResultMode,
> = TMode extends 'model' ? SchemaResult<TSchema> : InferObject<TSchema>

/** Maps every terminal to either its neutral Runtime record or public model result. */
type InferOperationResultFor<
	TOperation extends OperationAstNode,
	TMode extends OperationResultMode,
> =
	TOperation extends FindOperationAst<
		infer TSchema,
		QueryExpressionNode,
		infer TSelectedField
	>
		? readonly QueryObjectResult<TSchema, TSelectedField, TMode>[]
		: TOperation extends FirstOperationAst<
					infer TSchema,
					QueryExpressionNode,
					infer TSelectedField
			  >
			? QueryObjectResult<TSchema, TSelectedField, TMode> | null
			: TOperation extends GetOperationAst<
						infer TSchema,
						QueryExpressionNode,
						infer TSelectedField
				  >
				? QueryObjectResult<TSchema, TSelectedField, TMode> | null
				: TOperation extends {
							readonly kind: 'count' | 'update-many' | 'delete-many'
					  }
					? number
					: TOperation extends { readonly kind: 'exists' }
						? boolean
						: TOperation extends CreateOneOperationAst<infer TSchema>
							? CompleteObjectResult<TSchema, TMode>
							: TOperation extends CreateManyOperationAst<
										infer TSchema,
										infer TAtomic
								  >
								? BulkOperationResult<
										CompleteObjectResult<TSchema, TMode>,
										TAtomic
									>
								: TOperation extends UpdateOneOperationAst<
											infer TSchema,
											UpdateExpressionNode,
											QueryExpressionNode,
											infer TSelectedField
									  >
									? QueryObjectResult<TSchema, TSelectedField, TMode> | null
									: TOperation extends UpsertOneOperationAst<
												infer TSchema,
												UpdateExpressionNode,
												QueryExpressionNode,
												infer TSelectedField
										  >
										? QueryObjectResult<TSchema, TSelectedField, TMode>
										: TOperation extends UpsertManyOperationAst<
													infer TSchema,
													UpdateExpressionNode,
													QueryExpressionNode,
													infer TAtomic
											  >
											? BulkOperationResult<
													CompleteObjectResult<TSchema, TMode>,
													TAtomic
												>
											: TOperation extends DeleteOneOperationAst<
														infer TSchema,
														QueryExpressionNode,
														infer TSelectedField
												  >
												? QueryObjectResult<
														TSchema,
														TSelectedField,
														TMode
													> | null
												: never

/** Maps every normalized terminal intent to its exact public model result. */
export type InferOperationResult<TOperation extends OperationAstNode> =
	InferOperationResultFor<TOperation, 'model'>

/** Maps every normalized terminal to the plain record used inside Runtime. */
export type InferOperationRecordResult<TOperation extends OperationAstNode> =
	InferOperationResultFor<TOperation, 'record'>
