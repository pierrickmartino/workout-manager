import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function HomePage() {
  return (
    <section>
      <h1>Welcome</h1>
      <p>
        Sign in to reach your Fitness Profile. Your session is held in a secure,
        HTTP-only Clerk cookie — no tokens are stored in localStorage.
      </p>
      <SignedOut>
        <SignInButton mode="modal">
          <button type="button">Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <Link href="/dashboard">Go to your dashboard →</Link>
      </SignedIn>
    </section>
  );
}
