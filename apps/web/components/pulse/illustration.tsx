import { cn } from "@/lib/utils";
import {
  ILLUSTRATION_ASPECT,
  ILLUSTRATION_HEIGHT,
  ILLUSTRATION_MAX_HEIGHT,
  ILLUSTRATION_WIDTH,
} from "@/lib/illustration-box";
import { Card } from "@/components/ui/card";

interface IllustrationProps {
  // The already-resolved image URL. The caller decides there is a picture to show — this
  // renders one, it never decides whether to.
  src: string;
  // The full alternative text, written by the caller, because only the caller knows what the
  // picture is of.
  alt: string;
}

// The one framed illustration in the app (ADR-0095): an exercise's curator-only picture, on
// the Exercise page and in the admin editor's preview alike.
//
// Its whole job is to take up its space before the image does. The box comes from
// `lib/illustration-box` — an aspect ratio, a height cap, and the matching `width`/`height`
// pair the <img> carries as a ratio hint for the moment before the stylesheet applies — so the
// description, muscle map and execution steps below it never jump when the bytes land. A plain
// <img> rather than next/image: no remote-image host is configured (issue #504), and the
// catalog's images are proxied or legacy URLs of unknown intrinsic size, which is exactly why
// the box cannot be derived from the picture.
export function Illustration({ src, alt }: IllustrationProps): React.JSX.Element {
  return (
    <Card className="overflow-hidden p-0">
      <div className={cn(ILLUSTRATION_ASPECT, ILLUSTRATION_MAX_HEIGHT, "w-full")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={ILLUSTRATION_WIDTH}
          height={ILLUSTRATION_HEIGHT}
          // Both surfaces put the illustration below the fold — under the Exercise page's
          // stat header, and under the admin editor's descriptive form.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      </div>
    </Card>
  );
}
