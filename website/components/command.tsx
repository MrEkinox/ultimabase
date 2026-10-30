'use client'
// A command to type, copied on a click.
import { useState } from 'react'

export function Command({ children }: { readonly children: string }) {
	const [copied, setCopied] = useState(false)
	const copy = async (): Promise<void> => {
		await navigator.clipboard.writeText(children)
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}
	return (
		<button
			aria-label={`Copy ${children}`}
			className="ub-command"
			onClick={() => void copy()}
			type="button"
		>
			<span aria-hidden="true" className="ub-prompt">
				$
			</span>
			<code>{children}</code>
			<span aria-live="polite" className="ub-copy">
				{copied ? 'Copied' : 'Copy'}
			</span>
		</button>
	)
}
