'use client';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from './ui/ThemeProvider';
import { ToastProvider } from './ui/Toast';
import { DialogProvider } from './ui/DialogProvider';
import { SocialDock } from './layout/SocialDock';

/** كل المزوّدات العامة بمكان واحد — ضعها داخل <body> في app/layout.tsx */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <DialogProvider>
            {children}
            <SocialDock />
          </DialogProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
