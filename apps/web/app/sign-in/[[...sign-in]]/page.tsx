import { SignIn } from "@clerk/nextjs";

// The in-app sign-in surface (finding #9). `auth.protect()` in proxy.ts redirects a
// signed-out visitor to a private deep link here, preserving the destination as
// `?redirect_url=…`; Clerk's <SignIn> returns them there after authentication and
// falls back to /dashboard when someone lands here directly. Giving `auth.protect()`
// an in-app target — rather than Clerk's hosted Account Portal — keeps sign-in
// on-domain under the strict-dynamic CSP the landing page's modal <SignInButton>
// already runs under (ADR-0036). The catch-all segment lets Clerk own its own
// sub-steps (factor-one, SSO callback) beneath /sign-in. Public via lib/route-access.
export default function SignInPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8">
      <SignIn fallbackRedirectUrl="/dashboard" signUpUrl="/sign-up" />
    </div>
  );
}
