"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Wand2,
  DollarSign,
  Target,
  Menu,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";

export default function AppSidebar() {
  const pathname = usePathname();
  const t = useT("common.sidebar");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setSidebarOpen(false);
      }
    }

    if (sidebarOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sidebarOpen]);

  const NAV_ITEMS = [
    { href: "/dashboard", icon: LayoutDashboard, label: t("dashboard") },
    { href: "/missions", icon: Target, label: t("missions") },
    { href: "/calendar", icon: CalendarDays, label: t("calendar") },
    { href: "/studio", icon: Wand2, label: t("studio") },
    { href: "/monetization", icon: DollarSign, label: t("monetization") },
  ];

  return (
    <>
      {/* Hamburger button - visible only on mobile */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <nav
        ref={sidebarRef}
        className={`fixed top-14 left-0 bottom-0 w-14 z-30 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-3 gap-1 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? "bg-violet-600 text-white"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              <Icon size={20} />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
