import React, { forwardRef } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, icon, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`w-full bg-zinc-900/60 border border-white/10 rounded-xl py-3 ${
              icon ? 'pl-11' : 'pl-4'
            } pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/10 transition-all duration-200 ${
              error ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/10' : ''
            } ${className}`}
            {...props}
          />
        </div>
        {error && (
          <span className="block text-xs text-red-400 mt-1 font-medium">{error}</span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
