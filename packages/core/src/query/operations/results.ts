import type { InferObject } from '../../schema/index.js'

import type { QueryExpressionNode } from '../ast/contracts.js'
import type { UpdateExpressionNode } from '../updates/contracts.js'
import type {
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
import type { InferQueryResult } from '../query/result.js'

/** Maps every normalized terminal intent to its exact public result shape. */
export type InferOperationResult<TOperation extends OperationAstNode> =
	TOperation extends FindOperationAst<
		infer TSchema,
		QueryExpressionNode,
		infer TSelectedField
	>
		? readonly InferQueryResult<TSchema, TSelectedField>[]
		: TOperation extends FirstOperationAst<
					infer TSchema,
					QueryExpressionNode,
					infer TSelectedField
			  >
			? InferQueryResult<TSchema, TSelectedField> | null
			: TOperation extends GetOperationAst<
						infer TSchema,
						QueryExpressionNode,
						infer TSelectedField
				  >
				? InferQueryResult<TSchema, TSelectedField> | null
				: TOperation extends {
							readonly kind: 'count' | 'update-many' | 'delete-many'
					  }
					? number
					: TOperation extends { readonly kind: 'exists' }
						? boolean
						: TOperation extends CreateOneOperationAst<infer TSchema>
							? InferObject<TSchema>
							: TOperation extends CreateManyOperationAst<infer TSchema>
								? readonly InferObject<TSchema>[]
								: TOperation extends UpdateOneOperationAst<
											infer TSchema,
											UpdateExpressionNode,
											QueryExpressionNode,
											infer TSelectedField
									  >
									? InferQueryResult<TSchema, TSelectedField> | null
									: TOperation extends UpsertOneOperationAst<
												infer TSchema,
												UpdateExpressionNode,
												QueryExpressionNode,
												infer TSelectedField
										  >
										? InferQueryResult<TSchema, TSelectedField>
										: TOperation extends UpsertManyOperationAst<infer TSchema>
											? readonly InferObject<TSchema>[]
											: TOperation extends DeleteOneOperationAst<
														infer TSchema,
														QueryExpressionNode,
														infer TSelectedField
												  >
												? InferQueryResult<TSchema, TSelectedField> | null
												: never
