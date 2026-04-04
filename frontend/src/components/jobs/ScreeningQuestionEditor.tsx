'use client'
// src/components/jobs/ScreeningQuestionEditor.tsx
import { useState } from 'react'
import { PencilIcon, TrashIcon, PlusIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import type { ScreeningQuestion } from '@/types'
import clsx from 'clsx'

interface Props {
  questions: ScreeningQuestion[]
  onChange: (questions: ScreeningQuestion[]) => void
}

const TYPE_COLORS: Record<string, string> = {
  motivation:  'bg-purple-50 text-purple-700 border-purple-200',
  experience:  'bg-blue-50 text-blue-700 border-blue-200',
  salary:      'bg-green-50 text-green-700 border-green-200',
  availability:'bg-amber-50 text-amber-700 border-amber-200',
  skill_probe: 'bg-orange-50 text-orange-700 border-orange-200',
}

export function ScreeningQuestionEditor({ questions, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<ScreeningQuestion>>({})

  const startEdit = (q: ScreeningQuestion) => {
    setEditingId(q.id)
    setEditValues({ questionTextEn: q.questionTextEn, questionTextAr: q.questionTextAr })
  }

  const saveEdit = (id: string) => {
    onChange(questions.map(q => q.id === id ? { ...q, ...editValues } : q))
    setEditingId(null)
    setEditValues({})
  }

  const removeQuestion = (id: string) => {
    onChange(questions.filter(q => q.id !== id))
  }

  const moveQuestion = (id: string, direction: 'up' | 'down') => {
    const idx = questions.findIndex(q => q.id === id)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === questions.length - 1) return
    const newQ = [...questions]
    const swap = direction === 'up' ? idx - 1 : idx + 1
    ;[newQ[idx], newQ[swap]] = [newQ[swap], newQ[idx]]
    onChange(newQ)
  }

  const addCustomQuestion = () => {
    const newQ: ScreeningQuestion = {
      id: `custom_${Date.now()}`,
      questionTextEn: '',
      questionTextAr: '',
      rationale: 'Custom question',
      type: 'skill_probe',
    }
    onChange([...questions, newQ])
    setEditingId(newQ.id)
    setEditValues({ questionTextEn: '', questionTextAr: '' })
  }

  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div key={q.id} className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
            <span className="w-6 h-6 rounded-full bg-brand-navy text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {idx + 1}
            </span>
            <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border capitalize', TYPE_COLORS[q.type] || TYPE_COLORS.skill_probe)}>
              {q.type.replace('_', ' ')}
            </span>
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => moveQuestion(q.id, 'up')} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <ChevronUpIcon className="w-4 h-4" />
              </button>
              <button onClick={() => moveQuestion(q.id, 'down')} disabled={idx === questions.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              <button onClick={() => startEdit(q)} className="p-1.5 text-gray-400 hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-colors">
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => removeQuestion(q.id)} disabled={questions.length <= 3} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30">
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Question content */}
          {editingId === q.id ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="label text-xs">English Question</label>
                <textarea
                  value={editValues.questionTextEn || ''}
                  onChange={(e) => setEditValues(v => ({ ...v, questionTextEn: e.target.value }))}
                  rows={2}
                  className="input text-sm resize-none"
                  placeholder="Enter question in English..."
                />
              </div>
              <div>
                <label className="label text-xs">Arabic Question <span className="text-gray-400">(سؤال بالعربية)</span></label>
                <textarea
                  value={editValues.questionTextAr || ''}
                  onChange={(e) => setEditValues(v => ({ ...v, questionTextAr: e.target.value }))}
                  rows={2}
                  className="input text-sm resize-none text-right"
                  dir="rtl"
                  placeholder="أدخل السؤال بالعربية..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">Cancel</button>
                <button onClick={() => saveEdit(q.id)} className="btn-primary text-xs">Save</button>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              <p className="text-sm text-gray-800">{q.questionTextEn || <span className="text-gray-400 italic">No English question set</span>}</p>
              {q.questionTextAr && (
                <details className="mt-1">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Show Arabic version</summary>
                  <p className="text-sm text-gray-600 text-right arabic-text mt-1 p-2 bg-gray-50 rounded" dir="rtl">{q.questionTextAr}</p>
                </details>
              )}
              {q.rationale && (
                <p className="text-xs text-gray-400 italic mt-1">💡 {q.rationale}</p>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add custom */}
      {questions.length < 6 && (
        <button
          onClick={addCustomQuestion}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-400 hover:border-brand-blue hover:text-brand-blue transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add custom question
        </button>
      )}

      {questions.length < 3 && (
        <p className="text-xs text-red-500 text-center">Minimum 3 questions required to activate the job</p>
      )}
    </div>
  )
}
