// Cron: hourly — sends reminders for missions waiting_input > 24h
// Must be called with Authorization: Bearer $CRON_SECRET

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { sendMissionReminders } from "@/lib/notifications";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  await sendMissionReminders(admin);

  return NextResponse.json({ ok: true });
}
