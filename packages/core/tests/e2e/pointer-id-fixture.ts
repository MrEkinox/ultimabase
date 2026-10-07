export const queuedPointerIds: string[] = []
let generatedPointerId = 0

export const generatePointerId = (): string => {
	const queued = queuedPointerIds.shift()

	if (queued !== undefined) return queued

	generatedPointerId += 1

	return `0198a43e-2431-7000-8000-${generatedPointerId.toString(16).padStart(12, '0')}`
}
