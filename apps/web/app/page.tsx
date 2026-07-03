import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

import { Overline } from "@/components/pulse/overline";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
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
              child (no nested icon element), so this CTA stays icon-free. */}
          <SignInButton mode="modal">
            <button
              type="button"
              className={buttonVariants({ className: "w-full" })}
            >
              Initiate session
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <Link href="/dashboard" className={buttonVariants({ className: "w-full" })}>
            Go to your dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </SignedIn>
      </Card>
    </section>
  );
}
