import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CredentialsAuthForm } from "@/components/credentials-auth-form";
import { safeCallbackPath } from "@/lib/scene-lander";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(safeCallbackPath(callbackUrl));

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
      <CredentialsAuthForm />
    </div>
  );
}
