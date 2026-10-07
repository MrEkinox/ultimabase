import Link from 'next/link'
import type { HTMLAttributes, ReactNode } from 'react'

import { joinClassNames } from '../lib/classes'

type ButtonVariant = 'primary' | 'secondary' | 'quiet'

export interface ButtonLinkProps {
	readonly children: ReactNode
	readonly className?: string
	readonly external?: boolean
	readonly href: string
	readonly variant?: ButtonVariant
}

export function ButtonLink({
	children,
	className,
	external = false,
	href,
	variant = 'primary',
}: ButtonLinkProps) {
	return (
		<Link
			className={joinClassNames('ub-button', `ub-button-${variant}`, className)}
			data-button={variant}
			href={href}
			rel={external ? 'noreferrer' : undefined}
			target={external ? '_blank' : undefined}
		>
			{children}
		</Link>
	)
}

export interface TextLinkProps {
	readonly children: ReactNode
	readonly className?: string
	readonly href: string
	readonly prefetch?: boolean
}

export function TextLink({
	children,
	className,
	href,
	prefetch,
}: TextLinkProps) {
	return (
		<Link
			{...(prefetch === undefined ? {} : { prefetch })}
			className={joinClassNames('ub-text-link', className)}
			href={href}
		>
			{children}
		</Link>
	)
}

export interface SectionProps extends HTMLAttributes<HTMLElement> {
	readonly children: ReactNode
	readonly width?: 'reading' | 'wide'
}

export function Section({
	children,
	className,
	width = 'wide',
	...props
}: SectionProps) {
	return (
		<section
			{...props}
			className={joinClassNames('ub-section', `ub-section-${width}`, className)}
		>
			{children}
		</section>
	)
}

export function Eyebrow({
	children,
	className,
	...props
}: HTMLAttributes<HTMLParagraphElement>) {
	return (
		<p {...props} className={joinClassNames('ub-eyebrow', className)}>
			{children}
		</p>
	)
}

export interface CalloutProps {
	readonly children: ReactNode
	readonly title: string
}

export function Callout({ children, title }: CalloutProps) {
	return (
		<aside className="ub-callout" data-callout>
			<span aria-hidden="true" className="ub-callout-marker" />
			<div>
				<p className="ub-callout-title">{title}</p>
				<div className="ub-callout-body">{children}</div>
			</div>
		</aside>
	)
}
