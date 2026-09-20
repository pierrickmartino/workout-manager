import { SignUp } from "@clerk/nextjs";

// The in-app sign-up surface, paired with app/sign-in (finding #9). Reached from the
// "Sign up" link inside <SignIn>, or directly. Preserves any `?redirect_url=…` Clerk
// carries over from the sign-in entry and otherwise sends a newly-created account to
// /dashboard (which forwards an incomplete profile on to /onboarding). Same strict
// CSP and catch-all routing rationale as app/sign-in. Public via lib/route-access.
export default function SignUpPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8">
      <SignUp fallbackRedirectUrl="/dashboard" signInUrl="/sign-in" />
    </div>
  );
}
