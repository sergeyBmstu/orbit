import { NextResponse } from "next/server";
import { generateUsers } from "@/lib/fakedata";

export const dynamic = "force-static";

export async function GET() {
  const users = generateUsers(40);
  return NextResponse.json({ users });
}
