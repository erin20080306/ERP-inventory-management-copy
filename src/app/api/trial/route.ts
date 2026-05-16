import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TRIAL_DAYS = 2;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ status: "no_session" });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { trialStart: true, isPaid: true },
  });

  if (!user) {
    return NextResponse.json({ status: "no_session" });
  }

  if (user.isPaid) {
    return NextResponse.json({ status: "paid" });
  }

  const startTs = user.trialStart.getTime();
  const expireTs = startTs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now >= expireTs) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: "trial", remainMs: expireTs - now });
}
