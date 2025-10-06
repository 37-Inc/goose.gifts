import { ReactNode } from 'react';

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // This layout applies to all /admin routes
  // Authentication checks are handled by middleware and individual pages
  return <>{children}</>;
}
