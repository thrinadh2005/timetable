'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { readAuthSession } from '@/lib/backend-client'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const session = readAuthSession()
    router.replace(session ? '/app' : '/login')
  }, [router])

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f6f5] dark:bg-[#01191c] text-[#172326] dark:text-[#cbd5e1]">
      <div className="text-center">
        <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[#b9cac7] dark:border-[#0a4a50] border-t-[#08747c] dark:border-t-[#00e5ff]" />
        <p className="mt-4 text-xs font-bold text-[#003135] dark:text-[#e0f2fe]">GMRITDU Academic Architecture</p>
        <p className="mt-1 text-[11px] text-[#647376] dark:text-[#94a3b8]">Verifying institutional session…</p>
      </div>
    </main>
  )
}

