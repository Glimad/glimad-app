'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const t = useT('auth.signup')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const sessionId = searchParams.get('sid')

  useEffect(() => {
    if (!sessionId) router.replace('/onboarding')
  }, [sessionId, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
          onboarding_session_id: sessionId ?? null,
        },
      },
    })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/verify')
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden flex flex-col">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute bottom-0 left-0 w-[600px] h-[500px] rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at bottom left, rgba(0,200,150,0.08) 0%, rgba(0,150,200,0.06) 40%, transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at bottom right, rgba(0,150,200,0.06) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Nav */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(12px)',
          height: '64px',
          borderBottomColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <span className="text-white font-bold text-xl tracking-tight">g+</span>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.3)' }}
            aria-label="Language"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
              <path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20M2 12h20" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 pt-24 relative z-10">
        <div className="w-full max-w-[440px] space-y-6">
          {/* Icon */}
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
              style={{
                background: 'linear-gradient(135deg, #00C9A7, #9B6BFF, #FF6B9D)',
                padding: '2px',
              }}
            >
              <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                <span className="text-3xl">✦</span>
              </div>
            </div>
          </div>

          {/* Heading */}
          <div className="text-center space-y-1">
            <h1 className="font-bold text-white" style={{ fontSize: '28px', fontWeight: 700 }}>
              {t('title')}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px' }}>
              {t('subtitle')}
            </p>
          </div>

          {/* Form card */}
          <form onSubmit={handleSubmit}>
            <div
              className="rounded-2xl p-6 space-y-4 mb-4"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* Full Name */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  {t('fullName')}
                </label>
                <div
                  className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                  }}
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder={t('fullNamePlaceholder')}
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                    style={{ caretColor: '#00C9A7', color: '#fff' }}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  {t('email')}
                </label>
                <div
                  className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                  }}
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3 8l9 6 9-6M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                    style={{ caretColor: '#00C9A7', color: '#fff' }}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: 'rgba(255,255,255,0.8)' }}
                >
                  {t('password')}
                </label>
                <div
                  className="flex items-center gap-3 rounded-lg px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                  }}
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" strokeWidth="1.5" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={t('passwordPlaceholder')}
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none"
                    style={{ caretColor: '#00C9A7', color: '#fff' }}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="flex-shrink-0"
                    style={{ color: 'rgba(255,255,255,0.4)' }}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" strokeWidth="1.5" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm mb-4" style={{ color: '#FF6B6B' }}>
                {error}
              </p>
            )}

            {/* Primary CTA */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-white text-sm transition-opacity disabled:opacity-40 mb-4"
              style={{
                background: 'linear-gradient(to right, #00C9A7, #48CAE4)',
                borderRadius: '8px',
                padding: '12px 28px',
                fontWeight: 600,
                fontSize: '15px',
              }}
            >
              {loading ? t('loading') : `${t('submit')} →`}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {t('orContinueWith')}
            </span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Social buttons */}
          <div className="space-y-3">
            {/* Google */}
            <button
              type="button"
              onClick={() => {}}
              className="w-full py-3 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-3 transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('continueGoogle')}
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={() => {}}
              className="w-full py-3 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-3 transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              {t('continueFacebook')}
            </button>

            {/* Twitter/X */}
            <button
              type="button"
              onClick={() => {}}
              className="w-full py-3 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-3 transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {t('continueTwitter')}
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {t('login_link')}{' '}
          <Link
            href="/login"
            className="font-medium transition-colors"
            style={{ color: '#00C9A7' }}
          >
            {t('login_cta')}
          </Link>
        </p>
      </footer>
    </div>
  )
}
