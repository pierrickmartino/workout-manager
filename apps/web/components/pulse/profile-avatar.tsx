import Link from "next/link";
import * as React from "react";

import type { ProfileAvatarView } from "@/lib/avatar/profile-avatar";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { Avatar } from "@/components/pulse/avatar";
import { Card } from "@/components/ui/card";

interface ProfileAvatarProps {
  avatar: ProfileAvatarView;
}

// The top of the Profile view (ADR-0136): the user's Avatar drawn larger than the header's
// 32px, with the character name as visible text, so their identity sits where their progress
// lives. The whole card links forward to the Avatar picker. The art stays decorative; the
// link's text names it. A missing name (the catalog could not be read) leaves just the art and the
// link. No hooks, so it is safe in Server Components.
export function ProfileAvatar({ avatar }: ProfileAvatarProps): React.JSX.Element {
  return (
    <Card className="p-0">
      <Link
        {...NAV_FORWARD}
        href="/profile/avatar"
        className="flex flex-wrap items-center gap-4 rounded-sm p-4 transition-colors hover:bg-elevated/70"
      >
        <Avatar art={avatar.art} size={72} />
        {/* Asks for 8rem beside the figure, so with large text the name drops beneath it
            whole instead of breaking mid-word in a sliver of a column (ADR-0085). */}
        <span className="flex min-w-0 flex-1 basis-32 flex-col gap-1.5">
          <span className="label-mono text-[11px] text-cyan">AVATAR</span>
          {avatar.name ? (
            <span className="text-pretty break-words font-display text-2xl font-bold leading-tight text-text-primary">
              {avatar.name}
            </span>
          ) : null}
          <span className="label-mono text-[10px] text-text-secondary">CHANGE AVATAR →</span>
        </span>
      </Link>
    </Card>
  );
}
