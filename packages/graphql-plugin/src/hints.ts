import { immutableArray } from '@ultimabase/shared'
import {
	FieldsOnCorrectTypeRule,
	GraphQLError,
	Kind,
	getEnterLeaveForKind,
	specifiedRules,
	type ASTVisitor,
	type ValidationRule,
} from 'graphql'

/** Names how to enable each field a disabled feature leaves out, per type. */
export type GraphqlDisabledFieldHints = ReadonlyMap<
	string,
	ReadonlyMap<string, string>
>

/** Collects the hints of one compiled schema while its types are created. */
export class GraphqlHintCollector {
	readonly #hints = new Map<string, Map<string, string>>()

	/** Records that `field` on `type` exists once `method` is enabled on `className`. */
	add(type: string, field: string, method: string, className: string): void {
		const fields = this.#hints.get(type) ?? new Map<string, string>()
		fields.set(field, `enable graphql: { ${method}: true } on ${className}`)
		this.#hints.set(type, fields)
	}

	get hints(): GraphqlDisabledFieldHints {
		return this.#hints
	}
}

/**
 * Replaces GraphQL's unknown-field rule: a field that a disabled feature
 * would add names how to enable it (ADR-0325); every other unknown field
 * keeps GraphQL's own message and suggestions.
 */
const hintedFieldsRule =
	(hints: GraphqlDisabledFieldHints): ValidationRule =>
	(context): ASTVisitor => {
		const standard = getEnterLeaveForKind(
			FieldsOnCorrectTypeRule(context),
			Kind.FIELD,
		)
		return {
			Field(node, key, parent, path, ancestors) {
				const type = context.getParentType()?.name
				const known = (context.getFieldDef() ?? undefined) !== undefined
				const hint =
					type === undefined || known
						? undefined
						: hints.get(type)?.get(node.name.value)
				if (hint === undefined) {
					// GraphQL's own rule reports every other unknown field.
					standard.enter?.call(this, node, key, parent, path, ancestors)
					return
				}
				context.reportError(
					new GraphQLError(
						`Cannot query field "${node.name.value}" on type "${type ?? ''}". hint: ${hint}`,
						{ nodes: node },
					),
				)
			},
		}
	}

/** GraphQL's specified rules, with hints for disabled features. */
export const graphqlValidationRules = (
	hints: GraphqlDisabledFieldHints,
): readonly ValidationRule[] =>
	immutableArray(
		specifiedRules.map((rule) =>
			rule === FieldsOnCorrectTypeRule ? hintedFieldsRule(hints) : rule,
		),
	)
