# Guitar scroll scene

The hero uses a transparent guitar illustration split into body, neck and headstock
layers. CSS perspective and GSAP ScrollTrigger rotate and separate those layers
as the user scrolls. Two existing guitar photographs provide ambient background
movement through the workspace. Reduced-motion preferences use the static scene.

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
