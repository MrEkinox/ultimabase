// ADR-0339 codemod for one TypeScript source: shape methods become `define`
// feature keys, `.with({ … })` becomes `.with((plugins) => plugins.k(v)…)`,
// `.with({ indexes })` moves to `define`, and the Role options of
// `RoleSchema.define` move to `plugins.roles({ … })`. What it cannot convert
// without guessing is flagged and left unchanged.
import ts from 'typescript'

import {
	continuesChain,
	isMethodCall,
	isRoleDefine,
	locateLine,
	methodName,
	officialFeatures,
	planWith,
	readChain,
	receiverOf,
	roleOptionNames,
	type Chain,
} from './chains.ts'
import {
	appendToList,
	applyEdits,
	isRegionMarker,
	readComments,
	removeProperties,
	type TextEdit,
} from './edits.ts'
import {
	builderHead,
	elementName,
	isCallback,
	isInWithCallback,
	moveIndexes,
	removeLink,
	rolesCall,
} from './rewrites.ts'

/** Why a call site was left for a manual conversion, or needs a review. */
export type FlagKind =
	| 'non-literal-define'
	| 'non-literal-with'
	| 'region-moved'
	| 'unconvertible-with-entry'
	| 'unexpected-chain'
	| 'unrooted-shape-method'
	| 'unknown-shape-method'
	| 'unrooted-with-object'
	| 'with-callback-without-plugins'

/** Options of {@link transformSource}. */
export interface TransformOptions {
	/**
	 * Shape methods that became `define` feature keys.
	 * @default ['acl', 'softDelete']
	 */
	readonly features?: readonly string[]
}

/** One call site the codemod left unchanged, or changed and wants reviewed. */
export interface CodemodFlag {
	readonly kind: FlagKind
	/**
	 * 1-based line of the call: in the output for a call left unchanged, in
	 * the input for a converted call to review.
	 */
	readonly line: number
	/** The first line of the call. */
	readonly snippet: string
}

/** What one transformation converted. */
export interface CodemodCounts {
	/** `.with({ … })` calls rewritten as callbacks or removed. */
	withObjects: number
	/** `.softDelete(…)` and `.acl()` calls moved into `define`. */
	shapeMethods: number
	/** `.with({ indexes })` entries moved into `define`. */
	withIndexes: number
	/** `RoleSchema.define` declarations whose Role options moved to `.with`. */
	roleOptions: number
}

/** The transformed text, its counts and the sites left for review. */
export interface CodemodResult {
	readonly text: string
	readonly counts: CodemodCounts
	readonly flags: readonly CodemodFlag[]
}

interface ChainConversion {
	readonly edits: readonly TextEdit[]
	readonly counts: CodemodCounts
	readonly review: readonly FlagKind[]
}

const emptyCounts = (): CodemodCounts => ({
	withObjects: 0,
	shapeMethods: 0,
	withIndexes: 0,
	roleOptions: 0,
})

const scriptKinds: readonly (readonly [RegExp, ts.ScriptKind])[] = [
	[/\.tsx$/u, ts.ScriptKind.TSX],
	[/\.jsx$/u, ts.ScriptKind.JSX],
	[/\.[cm]?js$/u, ts.ScriptKind.JS],
]

const scriptKindOf = (fileName: string): ts.ScriptKind =>
	scriptKinds.find(([pattern]) => pattern.test(fileName))?.[1] ??
	ts.ScriptKind.TS

type ChainOutcome = ChainConversion | FlagKind | undefined

const convertChain = (text: string, chain: Chain): ChainOutcome => {
	const { links, define } = chain
	const withLinks = links.filter((link) => link.name === 'with')
	const withLink = withLinks[0]
	const shapes = links.filter((link) => link.name !== 'with')
	const withArgument = withLink?.call.arguments[0]
	if (define === undefined) {
		// `.with(index, value)` of arrays and other unrelated methods, and the
		// builder methods of a `.with` callback (`plugins.acl({ … })`).
		if (
			(withLink !== undefined && withLink.call.arguments.length !== 1) ||
			isInWithCallback(chain.top)
		) {
			return undefined
		}
		if (shapes.length > 0) return 'unrooted-shape-method'
		if (
			withArgument !== undefined &&
			ts.isObjectLiteralExpression(withArgument)
		) {
			return 'unrooted-with-object'
		}
		return withArgument === undefined || isCallback(withArgument)
			? undefined
			: 'non-literal-with'
	}
	if (
		withLinks.length > 1 ||
		(withLink !== undefined &&
			(links.at(-1) !== withLink || withLink.call.arguments.length !== 1))
	) {
		return 'unexpected-chain'
	}
	if (
		withArgument !== undefined &&
		!ts.isObjectLiteralExpression(withArgument) &&
		!isCallback(withArgument)
	) {
		return 'non-literal-with'
	}
	if (chain.unknown.length > 0) return 'unknown-shape-method'
	if (shapes.some((link) => link.call.arguments.length > 1)) {
		return 'unexpected-chain'
	}
	const plan =
		withArgument !== undefined && ts.isObjectLiteralExpression(withArgument)
			? planWith(text, withArgument)
			: undefined
	if (
		withArgument !== undefined &&
		ts.isObjectLiteralExpression(withArgument) &&
		plan === undefined
	) {
		return 'unconvertible-with-entry'
	}
	const [defineArgument] = define.arguments
	const object =
		define.arguments.length === 1 &&
		defineArgument !== undefined &&
		ts.isObjectLiteralExpression(defineArgument)
			? defineArgument
			: undefined
	const roleProperties =
		object !== undefined && isRoleDefine(define)
			? object.properties.filter((property) =>
					roleOptionNames.has(elementName(property) ?? ''),
				)
			: []
	if (
		object === undefined &&
		(shapes.length > 0 || plan?.indexes !== undefined)
	) {
		return 'non-literal-define'
	}
	if (
		plan === undefined &&
		shapes.length === 0 &&
		roleProperties.length === 0
	) {
		return undefined
	}
	const counts = emptyCounts()
	const edits: TextEdit[] = []
	const review: FlagKind[] = []
	const entries: string[] = []
	if (object !== undefined && plan?.indexes !== undefined) {
		const moved = moveIndexes(text, object, plan.indexes)
		edits.push(...moved.edits)
		if (moved.entry !== undefined) entries.push(moved.entry)
		if (readComments(text, plan.indexes.getFullStart()).some(isRegionMarker)) {
			review.push('region-moved')
		}
		counts.withIndexes += 1
	}
	for (const link of shapes) {
		if (
			object?.properties.some((property) => elementName(property) === link.name)
		) {
			return 'unexpected-chain'
		}
		const [options] = link.call.arguments
		const value =
			options === undefined
				? 'true'
				: text.slice(link.call.arguments.pos, link.call.arguments.end).trim()
		const comments = readComments(text, receiverOf(link.call).end)
		entries.push(
			[
				...comments.filter((comment) => !isRegionMarker(comment)),
				`${link.name}: ${value}`,
			].join('\n'),
		)
		edits.push(removeLink(text, link, isRegionMarker))
		counts.shapeMethods += 1
	}
	if (object !== undefined) {
		edits.push(
			...appendToList(
				text,
				object.properties,
				object.getStart(),
				object.end - 1,
				entries,
			),
		)
	}
	const roles =
		roleProperties.length === 0 ? undefined : rolesCall(text, roleProperties)
	if (object !== undefined && roles !== undefined) {
		edits.push(...removeProperties(text, object, roleProperties))
		counts.roleOptions += 1
	}
	if (
		withLink !== undefined &&
		withArgument !== undefined &&
		plan !== undefined
	) {
		const builder = [...(roles === undefined ? [] : [roles]), ...plan.builder]
		counts.withObjects += 1
		if (builder.length === 0 && plan.indexes !== undefined) {
			// Comments the object held besides its indexes stay in place.
			edits.push(
				removeLink(text, withLink, () => true, readComments(plan.trailing, 0)),
			)
		} else {
			const multiline = withArgument.getText().includes('\n')
			const trailing = plan.trailing === '' ? '' : `${plan.trailing}\n`
			edits.push({
				start: withArgument.getStart(),
				end: withArgument.end,
				replacement: `(plugins) =>${multiline ? '\n' : ' '}plugins${builder.join('')}${trailing}`,
			})
		}
	} else if (roles !== undefined && withArgument !== undefined) {
		const head = builderHead(withArgument)
		if (head === undefined) return 'with-callback-without-plugins'
		edits.push({ start: head, end: head, replacement: roles })
	} else if (roles !== undefined) {
		edits.push({
			start: chain.top.end,
			end: chain.top.end,
			replacement: `.with((plugins) => plugins${roles})`,
		})
	}
	return { edits, counts, review }
}

const firstLine = (node: ts.Node): string =>
	node.getText().split('\n')[0]?.trim() ?? ''

interface Pass {
	readonly edits: TextEdit[]
	readonly counts: CodemodCounts
	readonly flags: CodemodFlag[]
}

const runPass = (
	text: string,
	fileName: string,
	linkNames: ReadonlySet<string>,
): Pass => {
	const source = ts.createSourceFile(
		fileName,
		text,
		ts.ScriptTarget.Latest,
		true,
		scriptKindOf(fileName),
	)
	const pass: Pass = { edits: [], counts: emptyCounts(), flags: [] }
	const claimed: (readonly [number, number])[] = []
	const visit = (node: ts.Node): void => {
		const isTop =
			ts.isCallExpression(node) &&
			!continuesChain(node, linkNames) &&
			(isMethodCall(node, linkNames) ||
				(methodName(node) === 'define' && isRoleDefine(node)))
		// A chain nested in a converted one is converted by the next pass.
		const nested = claimed.some(
			([start, end]) => node.getStart() >= start && node.end <= end,
		)
		if (isTop && !nested) {
			const outcome = convertChain(text, readChain(node, linkNames))
			if (typeof outcome === 'string') {
				pass.flags.push({
					kind: outcome,
					line: locateLine(source, node),
					snippet: firstLine(node),
				})
			} else if (outcome !== undefined && outcome.edits.length > 0) {
				claimed.push([node.getStart(), node.end])
				pass.edits.push(...outcome.edits)
				for (const key of Object.keys(pass.counts) as (keyof CodemodCounts)[]) {
					pass.counts[key] += outcome.counts[key]
				}
				for (const kind of outcome.review) {
					pass.flags.push({
						kind,
						line: locateLine(source, node),
						snippet: firstLine(node),
					})
				}
			}
		}
		ts.forEachChild(node, visit)
	}
	visit(source)
	return pass
}

/**
 * Converts one TypeScript source to the ADR-0339 form. Runs until a pass
 * changes nothing, so chains nested in converted values are converted too.
 *
 * @example `transformSource("App.Schema.define({ className: 'A', fields }).acl().with({ acl: rule })", 'a.ts').text`
 */
export const transformSource = (
	text: string,
	fileName: string,
	options: TransformOptions = {},
): CodemodResult => {
	const linkNames = new Set(['with', ...(options.features ?? officialFeatures)])
	const counts = emptyCounts()
	const reviews: CodemodFlag[] = []
	let current = text
	for (let iteration = 0; iteration < 10; iteration += 1) {
		const pass = runPass(current, fileName, linkNames)
		if (pass.edits.length === 0) {
			// Review flags were raised on earlier passes; their lines may have moved.
			return { text: current, counts, flags: [...reviews, ...pass.flags] }
		}
		current = applyEdits(current, pass.edits)
		for (const key of Object.keys(counts) as (keyof CodemodCounts)[]) {
			counts[key] += pass.counts[key]
		}
		reviews.push(...pass.flags.filter((flag) => flag.kind === 'region-moved'))
	}
	throw new RangeError(`${fileName}: the codemod did not converge`)
}
