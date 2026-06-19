import clsx from 'clsx'
import React from 'react'

interface Props {
  className?: string
  loading?: 'lazy' | 'eager'
  priority?: 'auto' | 'high' | 'low'
}

export const Logo = (props: Props) => {
  const { loading: loadingFromProps, priority: priorityFromProps, className } = props

  const loading = loadingFromProps || 'lazy'
  const priority = priorityFromProps || 'low'

  return (
    /* eslint-disable @next/next/no-img-element */
    <img
      alt="High6"
      decoding="async"
      fetchPriority={priority}
      height={34}
      loading={loading}
      src="/high6-logo.png"
      width={102}
      className={clsx('h-[34px] w-auto dark:invert', className)}
    />
  )
}
