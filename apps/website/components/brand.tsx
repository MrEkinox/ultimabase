'use client'

import type { ComponentProps } from 'react'

import { joinClassNames } from '../lib/classes'
import { siteConfig } from '../lib/site'
import { BrandMark } from './brand-mark'

export interface BrandProps {
	readonly className?: string
	readonly compact?: boolean
}

export function Brand({ className, compact = false }: BrandProps) {
	return (
		<span className={joinClassNames('ub-brand', className)} data-brand>
			<span className="ub-brand-mark">
				<BrandMark />
			</span>
			{compact ? null : (
				<span className="ub-brand-name">{siteConfig.name}</span>
			)}
		</span>
	)
}

export function NavigationBrand({ className, ...props }: ComponentProps<'a'>) {
	return (
		<a {...props} className={joinClassNames('ub-brand-link', className)}>
			<Brand />
		</a>
	)
}
