import { useState } from 'react'
import { Heart, LockKeyhole, Mail } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui'
import { formatApiError } from '../services/api'

export function LoginPage() {
  const { auth, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (auth) return <Navigate to="/" replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      await login(email, password)

      navigate(
        (location.state as { from?: string })?.from || '/',
        { replace: true }
      )
    } catch (err) {
      setError(formatApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,_#f5dfe3,_transparent_35%),radial-gradient(circle_at_bottom_right,_#d8ccd9,_transparent_35%)] px-5 dark:bg-[#171317]">

      <motion.form
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/70 p-8 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-white/[.06]"
      >

        {/* Heart Icon */}
        <div className="grid h-13 w-13 place-items-center rounded-2xl bg-wine text-cream shadow-glow">
          <Heart fill="currentColor" />
        </div>

        {/* Heading */}
        <p className="mt-7 text-xs font-bold uppercase tracking-[.2em] text-rose">
          Private for two
        </p>

        <h1 className="mt-2 font-display text-4xl text-ink dark:text-cream">
          Welcome home.
        </h1>

        <p className="mt-3 text-sm leading-6 text-ink/60 dark:text-cream/60">
          A quiet, protected place for your little moments together.
        </p>

        {/* Error Message */}
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {/* Email */}
        <label className="mt-7 block text-sm font-semibold text-ink dark:text-cream">
          Email

          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-black/10 bg-white/55 px-3 dark:border-white/10 dark:bg-black/10">
            <Mail
              size={16}
              className="shrink-0 text-rose"
            />

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              type="email"
              required
              className="h-12 w-full bg-transparent text-ink outline-none dark:text-cream dark:placeholder:text-cream/40"
              placeholder="you@example.com"
            />
          </div>
        </label>

        {/* Password */}
        <label className="mt-4 block text-sm font-semibold text-ink dark:text-cream">
          Password

          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-black/10 bg-white/55 px-3 dark:border-white/10 dark:bg-black/10">
            <LockKeyhole
              size={16}
              className="shrink-0 text-rose"
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              type="password"
              minLength={8}
              required
              className="h-12 w-full bg-transparent text-ink outline-none dark:text-cream dark:placeholder:text-cream/40"
              placeholder="••••••••"
            />
          </div>
        </label>

        {/* Login Button */}
        <Button
          disabled={busy}
          className="mt-7 w-full bg-wine text-cream hover:bg-[#401222]"
        >
          {busy ? 'Opening your space…' : 'Enter our space'}

          <Heart
            size={16}
            fill="currentColor"
          />
        </Button>

        {/* Footer */}
        <p className="mt-5 text-center text-xs leading-5 text-ink/45 dark:text-cream/45">
          Access is limited to the two accounts created by the couple. No
          public sign-up.
        </p>

      </motion.form>
    </main>
  )
}