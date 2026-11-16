export const guitarChapters = [
  {
    id: "tuning", title: "Find your tuning", focus: { x: 0.61, y: 0.12 }, scale: 2.2,
    parts: [
      { name: "Headstock", description: "Holds the tuning machines at the end of the neck.", x: 0.62, y: 0.065 },
      { name: "Tuning machines", description: "Turn these to tighten or loosen each string and change its pitch.", x: 0.68, y: 0.14 },
      { name: "Nut", description: "Guides the strings into evenly spaced slots before the first fret.", x: 0.61, y: 0.166 },
    ],
  },
  {
    id: "playing", title: "Where chords take shape", focus: { x: 0.56, y: 0.35 }, scale: 1.75,
    parts: [
      { name: "Neck", description: "Supports the fretboard and gives your fretting hand a grip.", x: 0.545, y: 0.28 },
      { name: "Frets", description: "Metal bars that mark the steps between musical notes.", x: 0.577, y: 0.32 },
      { name: "Fretboard", description: "The playing surface where you press strings to choose notes.", x: 0.55, y: 0.405 },
    ],
  },
  {
    id: "strings", title: "Find your notes", focus: { x: 0.55, y: 0.41 }, scale: 1.65,
    parts: [
      { name: "Position markers", description: "Dots that help you find your way along the fretboard.", x: 0.585, y: 0.304 },
      { name: "Strings", description: "Vibrate when picked or strummed to create the sound.", x: 0.53, y: 0.50 },
    ],
  },
  {
    id: "body", title: "The resonant body", focus: { x: 0.51, y: 0.59 }, scale: 1.65,
    parts: [
      { name: "Soundboard", description: "The wooden top vibrates to help amplify the strings.", x: 0.38, y: 0.535 },
      { name: "Sound hole", description: "Works with the hollow body to shape the guitar’s resonance.", x: 0.52, y: 0.62 },
      { name: "Rosette", description: "The decorative ring around the sound hole.", x: 0.44, y: 0.63 },
    ],
  },
  {
    id: "protection", title: "Protecting the wood", focus: { x: 0.57, y: 0.70 }, scale: 1.65,
    parts: [
      { name: "Pickguard", description: "Protects the top from scratches made by your pick.", x: 0.625, y: 0.69 },
      { name: "Binding", description: "The trim that protects the edges where the body panels meet.", x: 0.715, y: 0.72 },
    ],
  },
  {
    id: "bridge", title: "The bridge and its parts", focus: { x: 0.50, y: 0.77 }, scale: 2.1,
    parts: [
      { name: "Saddle", description: "Supports the strings at the bridge and sets their speaking length.", x: 0.50, y: 0.762 },
      { name: "Bridge pins", description: "Hold the string ends securely inside the bridge.", x: 0.51, y: 0.777 },
      { name: "Bridge", description: "Transfers string vibration into the soundboard.", x: 0.415, y: 0.78 },
    ],
  },
] as const;

/** Project an image-relative anchor through the same centred pan/zoom as the photograph. */
export function projectGuitarAnchor(
  anchor: { x: number; y: number },
  image: { left: number; top: number; width: number; height: number },
  camera: { x: number; y: number; scale: number },
) {
  return {
    x: image.left + image.width / 2 + (anchor.x - 0.5) * image.width * camera.scale + camera.x,
    y: image.top + image.height / 2 + (anchor.y - 0.5) * image.height * camera.scale + camera.y,
  };
}
