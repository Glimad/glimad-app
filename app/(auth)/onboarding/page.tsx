'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ONBOARDING_QUESTIONS, TOTAL_STEPS } from '@/lib/onboarding/config'

type Answers = Record<string, string | string[]>

export default function OnboardingPage() {
  const t = useTranslations('onboarding')
  const router = useRouter()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [loading, setLoading] = useState(false)

  const question = ONBOARDING_QUESTIONS[step]
  const questionT = t.raw(`questions.${question.key}`) as Record<string, string | string[]>
  const questionText = questionT.text as string
  const questionOptions = questionT.options as string[] | undefined
  const questionHint = questionT.hint as string | undefined
  const questionPlaceholder = questionT.placeholder as string | undefined

  useEffect(() => {
    const visitorId = localStorage.getItem('glimad_visitor_id') ?? crypto.randomUUID()
    localStorage.setItem('glimad_visitor_id', visitorId)

    // Resume existing session from cookie if present
    const existingSid = document.cookie
      .split('; ')
      .find(row => row.startsWith('glimad_onboarding_sid='))
      ?.split('=')[1]

    if (existingSid) {
      setSessionId(existingSid)
      return
    }

    fetch('/api/onboarding/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: visitorId }),
    })
      .then(r => r.json())
      .then(data => {
        const sid = data.onboarding_session_id
        setSessionId(sid)
        // Persist session ID in cookie so page refresh doesn't lose it
        document.cookie = `glimad_onboarding_sid=${sid}; path=/; max-age=86400; SameSite=Lax`
      })
  }, [])

  const currentAnswer = answers[question.key]

  function toggleMulti(option: string) {
    const prev = (answers[question.key] as string[]) ?? []
    const next = prev.includes(option)
      ? prev.filter(o => o !== option)
      : [...prev, option]
    setAnswers({ ...answers, [question.key]: next })
  }

  function selectSingle(option: string) {
    setAnswers({ ...answers, [question.key]: option })
  }

  function setTextAnswer(value: string) {
    setAnswers({ ...answers, [question.key]: value })
  }

  async function handleNext() {
    if (!sessionId || !currentAnswer) return
    setLoading(true)

    const isLast = step === TOTAL_STEPS - 1

    if (isLast) {
      await fetch(`/api/onboarding/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_responses: { [question.key]: currentAnswer } }),
      })
      // Clear the onboarding cookie — session is now completed
      document.cookie = 'glimad_onboarding_sid=; path=/; max-age=0'
      router.push(`/signup?sid=${sessionId}`)
    } else {
      await fetch(`/api/onboarding/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: step + 1, responses: { [question.key]: currentAnswer } }),
      })
      setStep(step + 1)
    }

    setLoading(false)
  }

  function handleBack() {
    if (step > 0) setStep(step - 1)
  }

  const canAdvance =
    question.type === 'multi_select'
      ? (currentAnswer as string[])?.length > 0
      : question.type === 'text'
      ? typeof currentAnswer === 'string' && currentAnswer.trim().length > 0
      : !!currentAnswer

  const progressPct = Math.round(((step + 1) / TOTAL_STEPS) * 100)
  const isLast = step === TOTAL_STEPS - 1

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
          <p className="text-zinc-400">{t('subtitle')}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-zinc-500 text-right">
            {t('step_of', { step: step + 1, total: TOTAL_STEPS })}
          </p>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white">{questionText}</h2>
          {questionHint && <p className="text-sm text-zinc-400">{questionHint}</p>}

          {question.type === 'multi_select' && questionOptions && (
            <div className="grid grid-cols-2 gap-3">
              {questionOptions.map(option => {
                const selected = ((currentAnswer as string[]) ?? []).includes(option)
                return (
                  <button
                    key={option}
                    onClick={() => toggleMulti(option)}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                      selected
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-violet-500'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          )}

          {question.type === 'text' && (
            <textarea
              value={(currentAnswer as string) ?? ''}
              onChange={e => setTextAnswer(e.target.value)}
              placeholder={questionPlaceholder}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
            />
          )}

          {question.type === 'select' && questionOptions && (
            <div className="space-y-3">
              {questionOptions.map(option => {
                const selected = currentAnswer === option
                return (
                  <button
                    key={option}
                    onClick={() => selectSingle(option)}
                    className={`w-full px-4 py-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                      selected
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-violet-500'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={handleBack}
              className="px-6 py-3 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors"
            >
              {t('back')}
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canAdvance || loading || !sessionId}
            className="flex-1 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
          >
            {loading ? t('loading') : isLast ? t('finish') : t('next')}
          </button>
        </div>
      </div>
    </div>
  )
}
