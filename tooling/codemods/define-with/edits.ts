// Text edits computed from AST positions: the codemod copies every value,
// comment and region marker verbatim and only rewrites the syntax around
// them, so a formatter run afterwards is the only reformatting.
import ts from 'typescript'

/** Replaces `text.slice(start, end)` with `replacement`. */
export interface TextEdit {
	readonly start: number
	readonly end: number
	readonly replacement: string
}

/** Applies non-overlapping edits; throws when two edits overlap. */
export const applyEdits = (
	text: string,
	edits: readonly TextEdit[],
): string => {
	const sorted = [...edits].sort(
		(left, right) => right.start - left.start || right.end - left.end,
	)
	let result = text
	let limit = Number.POSITIVE_INFINITY
	for (const edit of sorted) {
		if (edit.end > limit) {
			throw new RangeError(
				`Overlapping edits at ${String(edit.start)}-${String(edit.end)}`,
			)
		}
		result =
			result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
		limit = edit.start
	}
	return result
}

/** Merges overlapping deletions into one edit each (replacements kept apart). */
export const mergeDeletions = (edits: readonly TextEdit[]): TextEdit[] => {
	const deletions = edits
		.filter((edit) => edit.replacement === '')
		.sort((left, right) => left.start - right.start)
	const merged: TextEdit[] = []
	for (const edit of deletions) {
		const last = merged.at(-1)
		if (last !== undefined && edit.start <= last.end) {
			merged[merged.length - 1] = {
				start: last.start,
				end: Math.max(last.end, edit.end),
				replacement: '',
			}
		} else merged.push(edit)
	}
	return [...merged, ...edits.filter((edit) => edit.replacement !== '')]
}

const regionMarker = /^\/\/\s*#?(?:end)?region\b/u

/** Whether one comment is a `//#region` or `//#endregion` marker line. */
export const isRegionMarker = (comment: string): boolean =>
	regionMarker.test(comment.trim())

/** The comments of one trivia span, in order. */
export const readComments = (text: string, position: number): string[] =>
	(ts.getLeadingCommentRanges(text, position) ?? []).map((range) =>
		text.slice(range.pos, range.end),
	)

/** The whitespace that starts the line holding `position`. */
export const lineIndentation = (text: string, position: number): string => {
	const lineStart = text.lastIndexOf('\n', position - 1) + 1
	return /^[\t ]*/u.exec(text.slice(lineStart))?.[0] ?? ''
}

/** Position of the next token after `position`, skipping blanks and comments. */
export const nextToken = (text: string, position: number): number => {
	let index = position
	while (index < text.length) {
		if (/\s/u.test(text.charAt(index))) index += 1
		else if (text.startsWith('//', index)) {
			const end = text.indexOf('\n', index)
			index = end === -1 ? text.length : end
		} else if (text.startsWith('/*', index)) {
			const end = text.indexOf('*/', index + 2)
			index = end === -1 ? text.length : end + 2
		} else break
	}
	return index
}

// End of the comments that follow `position` on its own line.
const sameLineCommentsEnd = (text: string, position: number): number =>
	(ts.getTrailingCommentRanges(text, position) ?? []).reduce(
		(end, range) => Math.max(end, range.end),
		position,
	)

/**
 * Appends entries to a comma-separated list (object properties or array
 * elements) whose closing token starts at `close`, following its layout:
 * one entry per line when the list spans lines, inline otherwise.
 */
export const appendToList = (
	text: string,
	items: ts.NodeArray<ts.Node>,
	open: number,
	close: number,
	entries: readonly string[],
): TextEdit[] => {
	if (entries.length === 0) return []
	const last = items.at(-1)
	if (last === undefined) {
		const inline = !text.slice(open, close).includes('\n')
		return [
			{
				start: open + 1,
				end: close,
				replacement: inline
					? ` ${entries.join(', ')} `
					: `\n${entries.map((entry) => `${lineIndentation(text, open)}\t${entry},`).join('\n')}\n${lineIndentation(text, close)}`,
			},
		]
	}
	const multiline = text.slice(open, last.end).includes('\n')
	const indent = lineIndentation(text, last.getStart())
	const separator = multiline ? `\n${indent}` : ' '
	const comma = nextToken(text, last.end)
	const hasComma = text[comma] === ','
	const anchor = sameLineCommentsEnd(text, hasComma ? comma + 1 : last.end)
	const appended = entries
		.map((entry) => `${separator}${entry.replaceAll('\n', `\n${indent}`)}`)
		.join(',')
	const replacement = hasComma || multiline ? `${appended},` : appended
	// Without a comma after the last entry, one is added right after it.
	if (hasComma) return [{ start: anchor, end: anchor, replacement }]
	return anchor === last.end
		? [{ start: anchor, end: anchor, replacement: `,${replacement}` }]
		: [
				{ start: last.end, end: last.end, replacement: ',' },
				{ start: anchor, end: anchor, replacement },
			]
}

/**
 * Deletes properties from an object literal, each with its leading comments
 * and one adjacent comma: the one after it, or for a last property without
 * one, the one after the last property kept before it.
 */
export const removeProperties = (
	text: string,
	object: ts.ObjectLiteralExpression,
	removed: readonly ts.ObjectLiteralElementLike[],
): TextEdit[] =>
	mergeDeletions(
		removed.map((property) => {
			const comma = nextToken(text, property.end)
			if (text[comma] === ',') {
				return {
					start: property.getFullStart(),
					end: comma + 1,
					replacement: '',
				}
			}
			const index = object.properties.indexOf(property)
			const kept = object.properties
				.slice(0, index)
				.findLast((candidate) => !removed.includes(candidate))
			return {
				start:
					kept === undefined
						? property.getFullStart()
						: nextToken(text, kept.end),
				end: property.end,
				replacement: '',
			}
		}),
	)

/** The text of one property with its leading comments, trimmed. */
export const propertyText = (
	text: string,
	property: ts.ObjectLiteralElementLike,
): string => text.slice(property.getFullStart(), property.end).trim()
