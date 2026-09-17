export interface SceneSource {
  slug: string
  levelId: number
  name: string
  description: string
}

export interface SceneObjectSource {
  sceneSlug: string
  vocabSlug: string
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export const SCENES: SceneSource[] = [
  {
    slug: 'scene-dog-cat',
    levelId: 3,
    name: 'Dog and Cat',
    description: 'a big brown dog and a small orange cat playing together in a backyard',
  },
  {
    slug: 'scene-colors-balloons',
    levelId: 5,
    name: 'Colorful Balloons',
    description:
      'eight colorful balloons in a row, each a different solid color: red, orange, yellow, green, blue, purple, black, and white',
  },
  {
    slug: 'scene-family-home',
    levelId: 2,
    name: 'Family at Home',
    description: 'a mom, a dad, an older brother, and an older sister posing together at home',
  },
  {
    slug: 'scene-family-school',
    levelId: 2,
    name: 'At School',
    description: 'a younger brother, a younger sister, and their teacher standing together at school',
  },
]

// Hotspot coordinates were authored by generating each scene image and
// visually inspecting it (see scripts/generate-scenes.ts and
// scripts/render-scene-debug.ts) — they cannot be known before the raster
// image exists. Re-authored 2026-09-16 for the Pixar-style regeneration
// (scene-colors-balloons excluded — see note below).
export const SCENE_OBJECTS: SceneObjectSource[] = [
  // scene-dog-cat: big brown dog on the left facing right, small orange cat on the right
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'dog', xPercent: 8, yPercent: 25, widthPercent: 52, heightPercent: 60 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'big', xPercent: 8, yPercent: 25, widthPercent: 52, heightPercent: 60 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'cat', xPercent: 56, yPercent: 48, widthPercent: 36, heightPercent: 45 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'small', xPercent: 56, yPercent: 48, widthPercent: 36, heightPercent: 45 },

  // scene-colors-balloons: re-authored 2026-09-17 for the new 8-balloon,
  // non-overlapping layout (512x512 image). Approximate clockwise from top-left:
  // red, yellow, white (top row), purple (right), orange, black, blue (middle),
  // green (left).
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-red', xPercent: 18, yPercent: 18, widthPercent: 26, heightPercent: 26 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-yellow', xPercent: 42, yPercent: 18, widthPercent: 26, heightPercent: 26 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-white', xPercent: 62, yPercent: 5, widthPercent: 24, heightPercent: 24 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-purple', xPercent: 74, yPercent: 30, widthPercent: 24, heightPercent: 26 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-green', xPercent: 4, yPercent: 38, widthPercent: 28, heightPercent: 28 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-blue', xPercent: 26, yPercent: 46, widthPercent: 24, heightPercent: 26 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-orange', xPercent: 58, yPercent: 44, widthPercent: 24, heightPercent: 26 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-black', xPercent: 48, yPercent: 65, widthPercent: 26, heightPercent: 28 },

  // scene-family-home: left to right — mom (yellow sweater), dad (blue shirt,
  // beard), older brother (green/tan striped hoodie), older sister (floral dress)
  { sceneSlug: 'scene-family-home', vocabSlug: 'mom', xPercent: 12, yPercent: 16, widthPercent: 21, heightPercent: 81 },
  { sceneSlug: 'scene-family-home', vocabSlug: 'dad', xPercent: 31, yPercent: 6, widthPercent: 25, heightPercent: 91 },
  { sceneSlug: 'scene-family-home', vocabSlug: 'older-brother', xPercent: 51, yPercent: 18, widthPercent: 16, heightPercent: 75 },
  { sceneSlug: 'scene-family-home', vocabSlug: 'older-sister', xPercent: 66, yPercent: 20, widthPercent: 25, heightPercent: 77 },

  // scene-family-school: left to right — younger brother, teacher (center,
  // green cardigan and glasses), younger sister
  { sceneSlug: 'scene-family-school', vocabSlug: 'younger-brother', xPercent: 2, yPercent: 32, widthPercent: 32, heightPercent: 68 },
  { sceneSlug: 'scene-family-school', vocabSlug: 'teacher', xPercent: 32, yPercent: 2, widthPercent: 36, heightPercent: 98 },
  { sceneSlug: 'scene-family-school', vocabSlug: 'younger-sister', xPercent: 60, yPercent: 30, widthPercent: 38, heightPercent: 68 },
]
