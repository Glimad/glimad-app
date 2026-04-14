"use client";

import { usePathname } from "next/navigation";

// Routes where the global Header/Footer should NOT render
const AUTH_ROUTES = ["/onboarding"];

export default function ConditionalShell({
  children,
  header,
  footer,
  offlineBanner,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  offlineBanner: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname?.startsWith(route));

  if (isAuthRoute) {
    // Auth pages have their own nav — render children only, no pt-14 offset
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {header}
      {offlineBanner}
      <main className="flex-1 pt-14">{children}</main>
      {footer}
    </div>
  );
}
