import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/Toast'

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'PostAI — Vídeos Instantâneos para Alunos',
  description: 'Compartilhe sua evolução física de forma premium e instantânea nas redes sociais.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} h-full antialiased dark`}>
      <body className="min-h-full bg-dark-bg text-slate-100 flex flex-col font-sans select-none md:select-text">
        <ToastProvider>
          <div className="flex-1 flex flex-col">
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  )
}
