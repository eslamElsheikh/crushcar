'use client'

import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { useLangStore } from '@/lib/lang'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0} refetchWhenOffline={false}>
      <QueryClientProvider client={queryClient}>
        <LangProvider>{children}</LangProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'hsl(240 6% 9%)',
              border: '1px solid hsl(240 4% 20%)',
              color: 'hsl(0 0% 98%)',
            },
          }}
        />
      </QueryClientProvider>
    </SessionProvider>
  )
}

function LangProvider({ children }: { children: React.ReactNode }) {
  const { lang, setLang } = useLangStore()
  const [showLang, setShowLang] = useState(false)

  return (
    <>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {children}
      </div>
    </>
  )
}

export { useLangStore }
export const tFn = () => useLangStore.getState().t