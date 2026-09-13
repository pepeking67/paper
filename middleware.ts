import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/admin";

export function middleware(request: NextRequest) {
  if (!process.env.SITE_PASSWORD) return NextResponse.next();
  if (verifyAdminRequest(request).ok) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Paper Study"', "Cache-Control": "no-store" } });
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
