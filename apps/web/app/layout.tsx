import type { Metadata, Viewport } from "next";
import {
  Space_Grotesk,
  JetBrains_Mono,
  Bricolage_Grotesque,
  Inter,
  IBM_Plex_Mono,
  Geist,
  Geist_Mono,
} from "next/font/google";
import {
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";

import { TabBar } from "@/components/pulse/tab-bar";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { buttonVariants } from "@/components/ui/button";
import { resolveActiveSkin } from "@/lib/active-skin";
import { resolveUserMode } from "@/lib/appearance";
import { resolveTheme } from "@/lib/theme";

import "./globals.css";

// Every Skin's typefaces are self-hosted by next/font at build time and exposed as
// CSS variables (ADR-0050). globals.css maps each Skin's `--font-*` tokens onto the
// relevant handle: PULSE → Space Grotesk / JetBrains Mono (the @theme default),
// Aurora → Bricolage Grotesque / Inter / IBM Plex Mono, Vercel → Geist / Geist Mono.
// Bundling all of them up front is what lets an admin publish a Skin and have its
// fonts apply on the next visit with no runtime fetch — the fixed-catalog trade-off.

// PULSE — Space Grotesk for display/body, JetBrains Mono for labels & data
// (the two typefaces specified by pulse.pen; the shipped default identity).
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

// Aurora — a softer humanist identity.
const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// IBM Plex Mono is not a variable font, so next/font requires explicit weights.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

// Vercel — the Geist identity (Geist Sans across display + body, Geist Mono data).
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

// Every Skin's font variables are attached to <html> so whichever Skin is active
// resolves its `--font-*` handles. Unused handles cost only their font payload,
// which next/font lazy-loads per glyph coverage.
const fontVariables = [
  spaceGrotesk.variable,
  jetbrainsMono.variable,
  bricolageGrotesque.variable,
  inter.variable,
  ibmPlexMono.variable,
  geist.variable,
  geistMono.variable,
].join(" ");

export const metadata: Metadata = {
  title: "PULSE // Workout Manager",
  description: "AI-assisted workout protocols and sessions.",
  manifest: "/manifest.json",
  // iOS ignores the manifest icons entirely and needs a linked apple-touch-icon
  // (180×180, opaque) or the home-screen icon falls back to a page screenshot.
  icons: {
    apple: "/apple-touch-icon.png",
  },
  // iOS standalone ("Add to Home Screen") is opted into via apple-mobile-web-app
  // meta tags, which Next emits from this block. Verify on a real device — this
  // path is not covered by Lighthouse (ADR-0028).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Workouts",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The rendered Theme is Active Skin × Mode (ADR-0047/0048), both resolved
  // server-side here so first paint is already correct — no flash of the wrong
  // appearance. The app-wide Active Skin and the user's own Mode are read in
  // parallel; `System` Mode is stamped as no `data-mode` so the
  // prefers-color-scheme fallback follows the device. globals.css keys its token
  // variants off exactly these `data-skin` / `data-mode` attributes.
  const [activeSkin, mode] = await Promise.all([
    resolveActiveSkin(),
    resolveUserMode(),
  ]);
  const themeAttributes = resolveTheme(activeSkin, mode);

  return (
    // `dynamic` is required by the strict-dynamic CSP: it lets Clerk read the
    // per-request nonce (emitted by `contentSecurityPolicy` in proxy.ts) at
    // request time so its injected scripts carry the nonce (ADR-0036, #257).
    <ClerkProvider dynamic>
      <html
        lang="en"
        className={fontVariables}
        {...themeAttributes}
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

          {/* Registers the minimal installability service worker (ADR-0028). */}
          <ServiceWorkerRegistrar />
        </body>
      </html>
    </ClerkProvider>
  );
}
