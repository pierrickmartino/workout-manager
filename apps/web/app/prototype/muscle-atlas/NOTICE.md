# PROTOTYPE artwork attribution — READ BEFORE SHIPPING

`sasha-figure-data.ts` contains muscle path geometry **derived from**
[Olkre/Sasha-s-Body-Map](https://github.com/Olkre/sasha-s-body-map)
(`svg/male-body.svg`), extracted and split into front/back halves for this throwaway
UI prototype.

**Licensing is unresolved.** As of extraction the upstream repository ships **no LICENSE
file**, which under GitHub's terms means the work is *all rights reserved* by default. This
derived data is therefore included **only** for the throwaway prototype so the design
direction can be judged.

Do **NOT** fold this artwork into the production atlas (`apps/web/lib/atlas/…`) without
first resolving licensing, by one of:

1. Obtaining explicit permission / a license from the upstream author, or
2. Commissioning or drawing **original** artwork in this anatomical style (the shipped
   atlas notes its own geometry is original and untraced — production must keep that
   property).

Delete this whole `app/prototype/` folder (and `components/prototype/`, and the
`/prototype` entries in `lib/route-access.ts` and `lib/tab-nav.ts`) once a direction is
chosen.
