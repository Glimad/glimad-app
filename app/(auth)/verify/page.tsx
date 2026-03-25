export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8 space-y-4 text-center">
        <div className="text-5xl">📬</div>
        <h1 className="text-3xl font-bold text-white">Check your email</h1>
        <p className="text-zinc-400">
          We sent a verification link to your email address. Click it to activate your account.
        </p>
        <p className="text-zinc-600 text-sm">You can close this tab.</p>
      </div>
    </div>
  )
}
