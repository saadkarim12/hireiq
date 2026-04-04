'use client'
// src/components/ui/TagInput.tsx
import { useState, KeyboardEvent } from 'react'
import { XMarkIcon } from '@heroicons/react/24/solid'
import clsx from 'clsx'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  max?: number
  className?: string
}

export function TagInput({ value, onChange, placeholder, max = 15, className }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed || value.includes(trimmed) || value.length >= max) return
    onChange([...value, trimmed])
    setInputValue('')
  }

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  return (
    <div className={clsx(
      'flex flex-wrap gap-1.5 p-2 border border-gray-300 rounded-lg bg-white min-h-[42px]',
      'focus-within:ring-2 focus-within:ring-brand-blue focus-within:border-transparent',
      className
    )}>
      {value.map((tag, i) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 bg-brand-blue/10 text-brand-blue text-xs font-semibold rounded-full"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="hover:bg-brand-blue/20 rounded-full p-0.5 transition-colors"
          >
            <XMarkIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
      {value.length < max && (
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => inputValue && addTag(inputValue)}
          placeholder={value.length === 0 ? placeholder : 'Add more...'}
          className="flex-1 min-w-[120px] outline-none text-sm placeholder-gray-400 bg-transparent"
        />
      )}
    </div>
  )
}
