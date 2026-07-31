import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@kawabunga/auth/config";

const { auth } = NextAuth({
  ...authConfig,
  pages: { signIn: "/auth/signin" },
});

export default auth((req) => {
  if (req.auth?.user) return;

  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/auth/signin", req.url);
  signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/debug/:path*",
    "/api/audio/:path*",
    "/api/debug/:path*",
  ],
};
