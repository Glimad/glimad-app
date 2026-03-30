'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Step = 'type' | 'topic' | 'generating' | 'review' | 'schedule' | 'done'

interface GeneratedContent {
  hook: string
  caption: string
  talking_points: string[]
  cta: string
  hashtags: string[]
}

const CONTENT_TYPES = [
  { id: 'reel', label: 'Reel', icon: '🎬', platforms: ['instagram', 'tiktok'] },
  { id: 'carousel', label: 'Carousel', icon: '📸', platforms: ['instagram'] },
  { id: 'story', label: 'Story Series', icon: '⭕', platforms: ['instagram'] },
  { id: 'short_video', label: 'Short Video', icon: '📱', platforms: ['tiktok', 'youtube'] },
  { id: 'post', label: 'Single Post', icon: '🖼️', platforms: ['instagram', 'twitter'] },
  { id: 'long_video', label: 'Long Video', icon: '🎥', platforms: ['youtube'] },
]

export default function StudioPage() {
  const t = useTranslations('studio')
  const router = useRouter()

  const [step, setStep] = useState<Step>('type')
  const [contentType, setContentType] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [editedContent, setEditedContent] = useState<GeneratedContent | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [regeneratingField, setRegeneratingField] = useState<string | null>(null)

  async function handleTypeSelect(type: string) {
    setContentType(type)
    setStep('topic')
    const res = await fetch('/api/studio/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: type }),
    })
    const data = await res.json()
    setTopics(data.topics)
  }

  async function handleTopicSelect(topic: string) {
    const finalTopic = topic || customTopic
    setSelectedTopic(finalTopic)
    setStep('generating')
    const res = await fetch('/api/studio/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType, topic: finalTopic }),
    })
    const data = await res.json()
    setEditedContent(data.content)
    setStep('review')
  }

  async function handleRegenerateField(field: string) {
    setRegeneratingField(field)
    const res = await fetch('/api/studio/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType, topic: selectedTopic }),
    })
    const data = await res.json()
    setEditedContent(prev => ({ ...prev!, [field]: data.content[field] }))
    setRegeneratingField(null)
  }

  async function handleApprove() {
    await fetch('/api/studio/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_type: contentType,
        topic: selectedTopic,
        content: editedContent,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    })
    setStep('done')
  }

  return (
    <div className="text-white max-w-2xl mx-auto px-4 pt-8 pb-12">

      {step === 'type' && (
        <div>
          <h1 className="text-2xl font-bold mb-2">{t('title')}</h1>
          <p className="text-zinc-400 mb-8">{t('type_subtitle')}</p>
          <div className="grid grid-cols-2 gap-4">
            {CONTENT_TYPES.map(ct => (
              <button
                key={ct.id}
                onClick={() => handleTypeSelect(ct.id)}
                className="bg-zinc-900 border border-zinc-800 hover:border-violet-500 rounded-xl p-6 text-left transition-colors"
              >
                <div className="text-3xl mb-3">{ct.icon}</div>
                <p className="font-semibold">{ct.label}</p>
                <p className="text-xs text-zinc-500 mt-1">{ct.platforms.join(', ')}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'topic' && (
        <div>
          <button onClick={() => setStep('type')} className="text-zinc-500 hover:text-zinc-300 text-sm mb-6 flex items-center gap-1">
            ← {t('back')}
          </button>
          <h2 className="text-xl font-bold mb-2">{t('topic_title')}</h2>
          <p className="text-zinc-400 mb-6">{t('topic_subtitle')}</p>
          {topics.length === 0 ? (
            <div className="flex items-center gap-3 text-zinc-400 py-8">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              {t('generating_topics')}
            </div>
          ) : (
            <div className="space-y-3">
              {topics.map((topic, i) => (
                <button
                  key={i}
                  onClick={() => handleTopicSelect(topic)}
                  className="w-full text-left bg-zinc-900 border border-zinc-800 hover:border-violet-500 rounded-xl px-5 py-4 text-sm transition-colors"
                >
                  {topic}
                </button>
              ))}
              <div className="pt-2">
                <input
                  type="text"
                  value={customTopic}
                  onChange={e => setCustomTopic(e.target.value)}
                  placeholder={t('custom_topic_placeholder')}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500"
                />
                {customTopic && (
                  <button
                    onClick={() => handleTopicSelect(customTopic)}
                    className="mt-3 w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
                  >
                    {t('use_custom_topic')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-xl font-semibold mb-2">{t('generating_title')}</p>
            <p className="text-zinc-400 text-sm">{t('generating_subtitle')}</p>
          </div>
        </div>
      )}

      {step === 'review' && editedContent && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">{t('review_title')}</h2>
            <button
              onClick={() => handleTopicSelect(selectedTopic)}
              className="text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              {t('regenerate_all')}
            </button>
          </div>

          <div className="space-y-5">
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{t('hook')}</label>
                <button
                  onClick={() => handleRegenerateField('hook')}
                  disabled={!!regeneratingField}
                  className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40"
                >
                  {regeneratingField === 'hook' ? '...' : t('regenerate')}
                </button>
              </div>
              <textarea
                value={editedContent.hook}
                onChange={e => setEditedContent({ ...editedContent, hook: e.target.value })}
                rows={2}
                className="w-full bg-transparent text-sm text-white resize-none focus:outline-none"
              />
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{t('caption')}</label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{editedContent.caption.length} / 2200</span>
                  <button
                    onClick={() => handleRegenerateField('caption')}
                    disabled={!!regeneratingField}
                    className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-40"
                  >
                    {regeneratingField === 'caption' ? '...' : t('regenerate')}
                  </button>
                </div>
              </div>
              <textarea
                value={editedContent.caption}
                onChange={e => setEditedContent({ ...editedContent, caption: e.target.value })}
                rows={6}
                className="w-full bg-transparent text-sm text-white resize-none focus:outline-none"
              />
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-3">{t('talking_points')}</label>
              <div className="space-y-2">
                {editedContent.talking_points.map((point, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-violet-400 text-sm mt-0.5">•</span>
                    <input
                      type="text"
                      value={point}
                      onChange={e => {
                        const pts = [...editedContent.talking_points]
                        pts[i] = e.target.value
                        setEditedContent({ ...editedContent, talking_points: pts })
                      }}
                      className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-3">{t('cta')}</label>
              <input
                type="text"
                value={editedContent.cta}
                onChange={e => setEditedContent({ ...editedContent, cta: e.target.value })}
                className="w-full bg-transparent text-sm text-white focus:outline-none"
              />
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{t('hashtags')}</label>
                <span className="text-xs text-zinc-500">{editedContent.hashtags.length} tags</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {editedContent.hashtags.map((tag, i) => (
                  <span key={i} className="bg-zinc-800 text-violet-300 text-xs px-3 py-1 rounded-full">#{tag}</span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep('schedule')}
            className="mt-6 w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors"
          >
            {t('approve')}
          </button>
        </div>
      )}

      {step === 'schedule' && (
        <div>
          <h2 className="text-xl font-bold mb-2">{t('schedule_title')}</h2>
          <p className="text-zinc-400 mb-8">{t('schedule_subtitle')}</p>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <label className="text-sm text-zinc-300 block mb-2">{t('schedule_label')}</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleApprove}
              className="flex-1 py-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors"
            >
              {scheduledAt ? t('schedule_and_save') : t('save_as_draft')}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2">{t('done_title')}</h2>
          <p className="text-zinc-400 mb-8">{scheduledAt ? t('done_scheduled') : t('done_draft')}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push('/calendar')}
              className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors"
            >
              {t('view_calendar')}
            </button>
            <button
              onClick={() => {
                setStep('type')
                setContentType('')
                setTopics([])
                setSelectedTopic('')
                setEditedContent(null)
                setScheduledAt('')
              }}
              className="px-6 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold text-sm transition-colors"
            >
              {t('create_another')}
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-semibold text-sm transition-colors"
            >
              {t('back_to_dashboard')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
