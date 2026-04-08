import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import LanguageSwitcher from "./LanguageSwitcher";
import AuthMenu from "./AuthMenu";

export default async function Header() {
  const cookieStore = cookies();
  const supabaseRef = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  ).hostname.split(".")[0];
  const authCookie = cookieStore.get(`sb-${supabaseRef}-auth-token`);
  let user = null;
  if (authCookie?.value?.startsWith("base64-")) {
    try {
      const session = JSON.parse(
        Buffer.from(authCookie.value.slice(7), "base64").toString("utf-8"),
      ) as { access_token?: string };
      if (session.access_token) {
        const admin = createAdminClient();
        const { data } = await admin.auth.getUser(session.access_token);
        user = data.user;
      }
    } catch {
      user = null;
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <a
          href={user ? "/dashboard" : "/onboarding"}
          className="flex items-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={process.env.NEXT_PUBLIC_LOGO_URL!}
            alt="Glimad"
            width={40}
            height={40}
          />
        </a>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <div className="w-px h-5 bg-zinc-700 mx-1" />
          <AuthMenu user={user ? { email: user.email! } : null} />
        </div>
      </div>
    </header>
  );
}
