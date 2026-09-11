import Link from "next/link";

import { RedeemShareButton } from "@/components/RedeemShareButton";
import { previewShare } from "@/lib/sessions";
import { toSharePreviewView } from "@/lib/redeem-share";
import { PageHeader } from "@/components/pulse/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

// The recipient's Share Link landing page (Redeem, ADR-0057, issue #398). Previews the linked
// Session — its Name, Training Type, and Author — without redeeming (the preview leaks nothing
// beyond those), then offers to Redeem it into an independent copy the recipient owns. A revoked or
// unknown link renders a plain "no longer available" state rather than any Session detail.
export default async function SharedSessionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = toSharePreviewView(await previewShare(token));

  if (!preview.valid) {
    return (
      <section className="flex flex-col gap-7">
        <PageHeader overline="PULSE // SHARED SESSION" title="Link unavailable" />
        <Card className="flex flex-col gap-4 p-5">
          <p className="font-sans text-[14px] leading-relaxed text-text-secondary">
            This share link is no longer available. It may have been revoked by the
            person who shared it, or the link may be incorrect.
          </p>
          <Link
            href="/train"
            className={buttonVariants({ variant: "secondary", className: "w-full" })}
          >
            Back to Train
          </Link>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-7">
      <PageHeader
        overline="PULSE // SHARED SESSION"
        title={preview.displayName}
        action={
          <Badge variant="magenta" className="capitalize">
            {preview.trainingType}
          </Badge>
        }
      />

      {/* Author credit (CONTEXT: Author): the human who first created this plan — preserved on the
          copy when redeemed, so even a shared plan keeps crediting its original creator. */}
      <p className="-mt-4 font-sans text-[13px] text-text-secondary">
        {preview.authorByline}
      </p>

      <Card className="flex flex-col gap-4 p-5">
        <p className="font-sans text-[14px] leading-relaxed text-text-secondary">
          Save this session to get your own independent copy. You can rename, edit,
          log, and re-share it — changes never affect the original.
        </p>
        <RedeemShareButton token={token} />
      </Card>
    </section>
  );
}
