# Guitar scroll scene

The hero uses one continuous transparent guitar photograph. A CSS-sticky viewport
stays below the navigation during approximately three viewport heights of scrolling.
GSAP ScrollTrigger drives a reversible tour from the complete instrument through
six groups covering tuning, the playing surface, strings and position markers,
the resonant body, its protective parts, and the bridge. It then returns to the
complete guitar. Shortcuts to chord setup and matching songs stay available.

`frontend/lib/guitarAnatomy.ts` contains beginner-friendly descriptions and normalized
image coordinates for each visible part. Pointer endpoints use the same centred
pan-and-zoom projection as the image. Layout measurements are cached on refresh,
so scroll updates only write transforms and SVG coordinates. Desktop explanations
sit alongside the photograph. Mobile explanations sit below it with compact labels
on the photograph. Each group has at most three numbered labels, paired with
numbered markers and higher-contrast leaders on the photograph. Hovering,
focusing or tapping a label or numbered marker highlights the matching label,
marker and leader. Active markers have enlarged pointer targets and support
Enter and Space. Only visible controls enter the tab order during animation.
The scroll instruction fades when exploration begins and stays hidden at the
end of the tour. Scrolling back to the entrance restores it.
The badge positions fan out vertically to
keep close components such as the saddle and bridge pins distinct. Pointer
endpoints stay anchored to the same normalized image coordinates. Two existing
guitar photographs provide ambient movement through the workspace and both
song-page routes.

The animation activates only with JavaScript and normal motion preferences, with
at least 700px of viewport height on desktop or 800px on phones. More compact
screens need the document-flow layout to fit every description and the song
shortcut. Reduced-motion, short-screen and JavaScript-free views display the
complete guitar with all six explanation groups in normal
document flow. All descriptions remain in the accessibility tree during the tour.
Resizing or changing motion preferences removes the previous animation and
refreshes its geometry. The photograph is never separated into horizontal slices.

The generated asset is `frontend/public/images/guitar-studio.png`. It was created
with the built-in image_gen tool and keeps its alpha channel. The existing Sharp
dependency produces the smaller `guitar-studio.webp` delivery asset with alpha.
The scene serves that optimized file directly through Next.js Image to support
the project's Vercel Services routing. The existing portrait and macro photographs remain in
`frontend/public/images/`.

The generation prompt was

```text
Create one photorealistic acoustic guitar product cutout asset for a premium dark music website. A complete full-length six-string acoustic guitar, entire headstock, neck, strings, bridge and body visible, classic warm amber spruce top with richly grained dark walnut sides, thin cream binding, realistic circular sound hole with understated rosette, correct six tuning pegs and six strings. Front three-quarter view with body thickness visible along its left edge, instrument nearly upright tilted about 12 degrees clockwise. Full object centered within a portrait 2:3 canvas with generous clear margin around every edge. Beautiful low-key studio photography, warm grazing light from upper left defines the carved curves, subtle soft neutral fill keeps the fretboard and neck readable against a near-black website. Crisp natural wood detail and realistic metal strings. Genuinely transparent background with alpha, no floor, no room, no pedestal, no hands, no text, no brand, no watermark, no visual effects. The guitar should occupy about 82% of the image height. Single guitar only.
```
