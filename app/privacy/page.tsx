export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16 text-zinc-300">
      <h1 className="text-3xl font-bold text-white mb-8">Privacy Policy</h1>
      <p className="text-sm text-zinc-500 mb-8">Last updated: March 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">1. Information We Collect</h2>
        <p className="leading-relaxed mb-3">We collect information you provide directly, including:</p>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>Account information (email address)</li>
          <li>Onboarding responses (niche, platform, content goals)</li>
          <li>Content you create using the platform</li>
          <li>Usage data and analytics</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">2. How We Use Your Information</h2>
        <p className="leading-relaxed mb-3">We use your information to:</p>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>Provide and improve the Glimad service</li>
          <li>Personalize AI-generated content recommendations</li>
          <li>Process payments and manage subscriptions</li>
          <li>Send important service communications</li>
          <li>Analyze usage patterns to improve the platform</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">3. Data Storage</h2>
        <p className="leading-relaxed">Your data is stored securely using Supabase infrastructure hosted in the EU (eu-west-1). We implement industry-standard security measures to protect your data.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">4. Third-Party Services</h2>
        <p className="leading-relaxed mb-3">We use the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li><strong className="text-zinc-300">Stripe</strong> — payment processing (governed by Stripe&apos;s privacy policy)</li>
          <li><strong className="text-zinc-300">Anthropic Claude</strong> — AI content generation (your prompts are not used to train models)</li>
          <li><strong className="text-zinc-300">Resend</strong> — transactional email delivery</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">5. Data Retention</h2>
        <p className="leading-relaxed">We retain your data for as long as your account is active. If you delete your account, your personal data is deleted within 30 days, except where retention is required by law.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">6. Your Rights</h2>
        <p className="leading-relaxed mb-3">Under GDPR and applicable laws, you have the right to:</p>
        <ul className="list-disc list-inside space-y-1 text-zinc-400">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Export your data in a portable format</li>
          <li>Withdraw consent at any time</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">7. Cookies</h2>
        <p className="leading-relaxed">We use essential cookies for authentication and locale preferences. We do not use tracking or advertising cookies.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-3">8. Contact</h2>
        <p className="leading-relaxed">For privacy inquiries or data requests, contact us at <a href="mailto:tech@glimad.com" className="text-violet-400 hover:underline">tech@glimad.com</a>.</p>
      </section>
    </div>
  )
}
