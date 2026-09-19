import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import { SignedOut, SignInButton } from "@clerk/nextjs";

import { resolveLandingRedirect } from "@/lib/landing-redirect";
import { Overline } from "@/components/pulse/overline";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// `/` is the signed-out welcome + sign-in surface. A returning, authenticated
// visitor is bounced to the dashboard server-side before paint so an installed-app
// cold launch lands one tap from the next Live session (navigation-review finding
// #2); the completeness gate stays in /dashboard. Signed-out visitors fall through
// and see the welcome below.
export default async function HomePage() {
  const target = await resolveLandingRedirect();
  if (target) {
    redirect(target);
  }

  return (
    <section className="flex flex-col gap-8 pt-4">
      <div className="flex flex-col gap-4">
        <Overline>PULSE // WELCOME</Overline>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-text-primary">
          Train with an
          <br />
          <span className="text-cyan">AI protocol.</span>
        </h1>
        <p className="max-w-sm font-sans text-[15px] leading-relaxed text-text-secondary">
          Sign in to reach your Fitness Profile. Your session is held in a
          secure, HTTP-only cookie — no tokens are stored in localStorage.
        </p>
      </div>

      <Card className="flex flex-col gap-5 p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-sm bg-cyan-dim">
          <Zap className="h-5 w-5 text-cyan" aria-hidden />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            Your command center
          </h2>
          <p className="font-mono text-[13px] leading-relaxed text-text-muted">
            Generated protocols, standalone sessions, logged performance, and
            progress — one operator dashboard.
          </p>
        </div>

        <SignedOut>
          {/* Clerk's SignInButton requires the trigger to hold a single text
              child (no nested icon element), so this CTA stays icon-free.
              forceRedirectUrl sends a fresh modal sign-in to the dashboard, so
              the just-signed-in path converges with the server-side bounce
              above rather than stranding the user on this now-stale screen. */}
          <SignInButton mode="modal" forceRedirectUrl="/dashboard">
            <button
              type="button"
              className={buttonVariants({ className: "w-full" })}
            >
              Initiate session
            </button>
          </SignInButton>
        </SignedOut>
      </Card>
    </section>
  );
}
