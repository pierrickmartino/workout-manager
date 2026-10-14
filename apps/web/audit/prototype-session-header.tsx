// PROTOTYPE — throwaway. Renders the Session header variants from
// app/sessions/[id]/_prototype/header-variants.tsx with synthetic data, so they can be compared
// without Clerk or the API: `npm run audit:serve`, then open /prototype-session-header.html
// (`?fav=1` for a favorited Session, `?open=A` to raise that variant's ⋯ sheet).
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./fonts.css";
import { HEADER_VARIANTS, HeaderVariant } from "@/app/sessions/[id]/_prototype/header-variants";
import { workout } from "./fixtures";

const params = new URLSearchParams(location.search);
const isFavorite = params.get("fav") === "1";
const session = { ...workout, name: "Upper push — heavy day", is_favorite: isFavorite, is_protocol_member: false, logged_count: 0 };

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto flex w-full max-w-shell flex-col gap-10 px-6 py-6">
    {HEADER_VARIANTS.filter((v) => v.key !== "current").map((v) => (
      <div key={v.key} data-variant={v.key} className="flex flex-col gap-7 border-b border-dashed border-yellow-400 pb-6">
        <p className="font-mono text-[11px] text-yellow-300">VARIANT {v.key} · {v.name}</p>
        <HeaderVariant
          variant={v.key}
          session={session}
          nameView={{ displayName: session.name, isUserNamed: true, editValue: session.name }}
          authorView={{ showByline: true, isNamed: true, byline: "by Sam Rivera", displayName: "Sam Rivera" }}
          favoriteView={{ show: true, isFavorite }}
          deleteView={{ show: true, canDelete: true, loggedCount: 0 }}
        />
      </div>
    ))}
  </main>,
);
