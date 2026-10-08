import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  Space_Grotesk,
  JetBrains_Mono,
  Bricolage_Grotesque,
  Inter,
  IBM_Plex_Mono,
  Geist,
  Geist_Mono,
} from "next/font/google";
import { ClerkProvider, Show, SignInButton } from "@clerk/nextjs";

import { TabBar } from "@/components/pulse/tab-bar";
import { Sidebar } from "@/components/pulse/sidebar";
import { NavigationGuardProvider } from "@/components/NavigationGuardProvider";
import { RouteTransition } from "@/components/RouteTransition";
import { OutboxSyncRegistrar } from "@/components/OutboxSyncRegistrar";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { buttonVariants } from "@/components/ui/button";
import {
  MAIN_CONTENT_ID,
  SKIP_LINK_HREF,
  SKIP_LINK_LABEL,
  NAV_LABELS,
} from "@/lib/shell-a11y";
import { resolveActiveSkin } from "@/lib/active-skin";
import { resolveIsAdmin } from "@/lib/admin";
import { resolveUserMode } from "@/lib/appearance";
import { resolveTheme } from "@/lib/theme";
import { themeColorFor } from "@/lib/theme-color";
import { persistentTransitionStyle } from "@/lib/persistent-transition";

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

// The browser chrome is painted in the rendered Theme's own page colour (ADR-0102), so
// this is resolved per request rather than stated as a constant: the Active Skin decides
// which `--color-base` the page carries, and a stamped Mode decides its polarity. System
// Mode leaves the polarity to the device, exactly as `globals.css` does, so it emits both
// media-conditioned branches. Both reads are React-`cache`d and the layout below makes
// the same two, so this costs no extra round-trip.
export async function generateViewport(): Promise<Viewport> {
  const [activeSkin, mode] = await Promise.all([resolveActiveSkin(), resolveUserMode()]);
  return {
    themeColor: themeColorFor(activeSkin, mode),
    width: "device-width",
    initialScale: 1,
  };
}

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
  // `isAdmin` joins them because the desktop sidebar carries an admin entry (ADR-0088's
  // amendment to ADR-0071). It is resolved here, server-side, so the Clerk role claim is
  // never read in the browser; `resolveIsAdmin` is React-`cache`d, so a page that also
  // needs it in the same request pays nothing extra.
  const [activeSkin, mode, isAdmin] = await Promise.all([
    resolveActiveSkin(),
    resolveUserMode(),
    resolveIsAdmin(),
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
        {/* `lg:flex` makes the desktop sidebar a flex *sibling* of the content column rather
            than a fixed overlay every other element has to offset itself around (ADR-0088).
            Clerk's <Show when="signed-in"> renders nothing when signed out, so on the sign-in
            screen the row simply has one item and the content fills the width — no conditional padding
            anywhere. Below `lg:` this is a plain block body, exactly as before. */}
        <body className="min-h-screen bg-base text-text-primary antialiased lg:flex">
          {/* Skip-to-content link: the first focusable element, hidden until focused so
              keyboard/screen-reader users can jump past the repeated shell chrome straight
              to <main>. Target id + href are the one contract in `lib/shell-a11y`. */}
          <a
            href={SKIP_LINK_HREF}
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-text-primary focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan"
          >
            {SKIP_LINK_LABEL}
          </a>
          {/* Desktop primary navigation (ADR-0088). Same registry as the TabBar, and only
              ever one of the two is in the accessibility tree — this is `hidden lg:flex`,
              the TabBar is `lg:hidden`, and `display: none` removes the other outright. */}
          <Show when="signed-in">
            <Sidebar isAdmin={isAdmin} />
          </Show>

          {/* The content column beside the sidebar. `min-w-0` is load-bearing: a flex child's
              automatic minimum is its content, so without it a wide table or an unbroken name
              would push the column past the viewport — ADR-0085's lesson, one level up. */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Slim branded top bar — the web analogue of the app status bar. `pt` carries the
                top safe-area inset so the bar clears the notch/status bar in iOS standalone
                (statusBarStyle: black-translucent); env() is 0 on non-notched devices. The
                wordmark lives here at *every* width and the sidebar carries none: hiding it at
                `lg:` left a signed-out desktop visitor — for whom the sidebar is not rendered
                at all — with an unbranded shell (#575 review). One wordmark, no conditional.
                Pinned out of the page's view-transition snapshot so it never slides (ADR-0119). */}
            <header
              style={persistentTransitionStyle("header")}
              className="sticky top-0 z-30 border-b border-border bg-base/90 pt-[env(safe-area-inset-top)] backdrop-blur"
            >
              <div className="mx-auto flex h-14 max-w-shell items-center justify-between px-6 lg:max-w-shell-wide">
                <span className="label-mono text-[13px] font-bold tracking-[0.2em] text-text-primary">
                  PULSE<span className="text-cyan"> //</span>
                </span>
                <nav aria-label={NAV_LABELS.account} className="flex items-center gap-3">
                  <Show when="signed-out">
                    {/* Clerk's SignInButton clones its child and re-validates
                        with React.Children.only; the trigger button must contain
                        a single text child (no nested elements/icons). */}
                    <SignInButton mode="modal" forceRedirectUrl="/dashboard">
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
                  </Show>
                  <Show when="signed-in">
                    {/* Account actions live on Profile so every sign-out passes through the
                        account-scoped local-state teardown (ADR-0059/0080). Clerk's default
                        UserButton sign-out bypasses that teardown, so it is not mounted here. */}
                    <Link
                      href="/profile"
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Account
                    </Link>
                  </Show>
                </nav>
              </div>
            </header>

            {/* `id`/`tabIndex` make this the skip link's landing target — tabIndex={-1} moves
                focus here (not just the viewport) on the jump. `pb` clears the fixed TabBar
                plus the bottom safe-area inset it now absorbs (see tab-bar.tsx); the 7rem base
                is unchanged, env() adds 0 on non-notched devices. At `lg:` the TabBar is gone,
                so that clearance goes with it and the frame widens to the shell's second
                width (ADR-0088). */}
            <main
              id={MAIN_CONTENT_ID}
              tabIndex={-1}
              className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-shell px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 lg:max-w-shell-wide lg:pb-16"
            >
              {/* The content column, which is narrow by default at every width. A page opts
                  into the wide frame by stamping `data-shell="wide"` on its own root, and
                  `:has()` is what lets this parent answer to that child — so converting a page
                  touches only that page, and the ~25 routes authored as a 416px column are not
                  stretched on the day the sidebar lands (ADR-0088). Where `:has()` is
                  unsupported a wide page stays narrow, which is the safe way to fail. */}
              <div
                data-shell-column
                className="mx-auto w-full lg:max-w-shell lg:has-[[data-shell=wide]]:max-w-shell-wide"
              >
                {/* Guards the authoring/correction forms against discarding unsaved work on
                    navigation (finding #4). Descendant forms opt in via useNavigationGuard;
                    the click interceptor it installs is document-wide, so it also catches the
                    TabBar and header links rendered outside this subtree. Inside it, the page
                    slides forward or back on a tagged navigation (ADR-0121). */}
                <NavigationGuardProvider>
                  <RouteTransition>{children}</RouteTransition>
                </NavigationGuardProvider>
              </div>
            </main>
          </div>

          {/* Bottom navigation is only meaningful once authenticated. Hidden at `lg:`, where
              the sidebar is the primary navigation instead. */}
          <Show when="signed-in">
            <TabBar />
            {/* Drains the finish outbox on reconnect / foreground / restart (ADR-0060,
                issue #413). Signed-in only: the queue is account-scoped. */}
            <OutboxSyncRegistrar />
            {/* The honest connectivity + sync-state surface over that outbox (issue #414):
                a non-blocking toast that distinguishes offline / saved-locally / syncing /
                synced / failed, with a manual retry on failure. */}
            <SyncStatusBanner />
          </Show>

          {/* Registers the minimal installability service worker (ADR-0028). */}
          <ServiceWorkerRegistrar />
        </body>
      </html>
    </ClerkProvider>
  );
}
