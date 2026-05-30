import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  glow = false,
  ...props
}) => {
  return (
    <div
      className={`glass-card rounded-2xl overflow-hidden ${
        glow ? 'glow-glow' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
