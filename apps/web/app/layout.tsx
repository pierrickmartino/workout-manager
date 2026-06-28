import type { Metadata, Viewport } from "next";
import { ClerkProvider, SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Workout Manager",
  description: "AI-assisted workout programs and sessions.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem 1.5rem",
              borderBottom: "1px solid #e2e8f0",
            }}
          >
            <strong>Workout Manager</strong>
            <nav>
              <SignedOut>
                <SignInButton />
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </nav>
          </header>
          <main style={{ padding: "1.5rem", maxWidth: 640, margin: "0 auto" }}>
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  );
}
