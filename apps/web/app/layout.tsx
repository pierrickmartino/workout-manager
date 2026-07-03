import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

import { TabBar } from "@/components/pulse/tab-bar";
import { buttonVariants } from "@/components/ui/button";

import "./globals.css";

// Space Grotesk for display/body and JetBrains Mono for labels & data — the two
// typefaces specified by pulse.pen. next/font self-hosts them and exposes each
// as a CSS variable consumed by the @theme font tokens in globals.css.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PULSE // Workout Manager",
  description: "AI-assisted workout programs and sessions.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      >
        <body className="min-h-screen bg-base text-text-primary antialiased">
          {/* Slim branded top bar — the web analogue of the app status bar. */}
          <header className="sticky top-0 z-30 border-b border-border bg-base/90 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-shell items-center justify-between px-6">
              <span className="label-mono text-[13px] font-bold tracking-[0.2em] text-text-primary">
                PULSE<span className="text-cyan"> //</span>
              </span>
              <nav className="flex items-center gap-3">
                <SignedOut>
                  {/* Clerk's SignInButton clones its child and re-validates
                      with React.Children.only; the trigger button must contain
                      a single text child (no nested elements/icons). */}
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className={buttonVariants({
                        variant: "secondary",
                        size: "sm",
                      })}
                    >
                      Sign in
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <UserButton
                    appearance={{
                      elements: { avatarBox: "h-8 w-8 rounded-sm" },
                    }}
                  />
                </SignedIn>
              </nav>
            </div>
          </header>

          <main className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-shell px-6 pb-28 pt-6">
            {children}
          </main>

          {/* Bottom navigation is only meaningful once authenticated. */}
          <SignedIn>
            <TabBar />
          </SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
