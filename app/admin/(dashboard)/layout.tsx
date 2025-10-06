import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/admin/auth';
import { Sidebar } from '@/components/admin/Sidebar';
import { ToastProvider } from '@/components/admin/Toast';
import { ReactNode } from 'react';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Check authentication on the server side
  const authenticated = await isAuthenticated();

  // If not authenticated, redirect to login
  if (!authenticated) {
    redirect('/admin/login');
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
