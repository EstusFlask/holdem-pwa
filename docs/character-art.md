# Full-body character art for all-in cut-ins and settlement banners

The current animation system uses each player's avatar as stand-in character art:
the avatar is scaled up and heavily blurred to fill the background, then the crisp
version composites on top. This gives the layout the reference shows — large art on
the left, copy on the right — without requiring actual illustrations. When a player
has no custom avatar, a gradient circle with their initial stands in.

## The full solution

Poker Fate uses per-player full-body character illustrations sized at roughly
720×960px portrait (or ~0.75 aspect). These sit in a content library keyed by player
or by avatar selection. The all-in cut-in and the settlement screen both pull the
matching art and render it at high fidelity beside the title and hand copy.

**Sourcing art at that volume** is the real cost: each player in the room needs a
unique character (or a pool of several dozen characters if players pick from a shared
gallery), the art style has to be consistent, and illustrations that read well when
scaled to fit a 400px-tall banner at 50% panel width are not cheap commissions.

## Migration path

If per-player art becomes available:

1. Add an `artUri` field to `PlayerProfile` in `src/game/types.ts`. The avatar is
   the 256px thumbnail; the art is the full illustration. Leave the field optional
   so the existing avatar fallback keeps working for players without art.

2. Update `AllInCutIn.vue` and `SettlementBanner.vue` to prefer `cutIn.artUri` or
   `primary.artUri` when present, falling back to the enlarged blurred avatar when
   absent. The templates already slot either an `<img>` or a gradient placeholder
   with initials, so the logic is a one-line change.

3. Ship a character gallery in the profile settings. Populate it from a bundled
   asset folder or a remote CDN. On mobile PWA installs, preload the art when the
   user picks a character so the cut-in never has to fetch mid-hand.

The animation timing and layout need no changes — those are locked in at the CSS
layer. The art just swaps in once it exists.

## Cost estimate

Commissioning 20–40 distinct character illustrations at ~$50–150 per character ranges
from $1000 to $6000 depending on style and artist rates. A shared gallery of 30
characters covers a 10-player room with no duplicates, and players can still upload
custom avatars as thumbnails while the stock art covers the cinematic moments.

An intermediate step: AI-generated character portraits (Stable Diffusion, Midjourney)
can fill a gallery at nearly zero marginal cost if the licensing and art direction
are workable. That gets you visual variety without commission fees, though the style
consistency and quality control are harder to lock down than with a single artist.
