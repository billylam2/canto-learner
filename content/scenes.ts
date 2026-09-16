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
// image exists.
export const SCENE_OBJECTS: SceneObjectSource[] = [
  // scene-dog-cat: big brown dog on the left, small orange cat on the right
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'dog', xPercent: 6, yPercent: 14, widthPercent: 54, heightPercent: 68 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'big', xPercent: 6, yPercent: 14, widthPercent: 54, heightPercent: 68 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'cat', xPercent: 50, yPercent: 46, widthPercent: 44, heightPercent: 40 },
  { sceneSlug: 'scene-dog-cat', vocabSlug: 'small', xPercent: 50, yPercent: 46, widthPercent: 44, heightPercent: 40 },

  // scene-colors-balloons: 8 balloons left to right in the order red, orange,
  // yellow, green, blue, purple, black, white
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-red', xPercent: 7, yPercent: 28, widthPercent: 11, heightPercent: 42 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-orange', xPercent: 18, yPercent: 28, widthPercent: 11, heightPercent: 42 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-yellow', xPercent: 29, yPercent: 28, widthPercent: 11, heightPercent: 42 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-green', xPercent: 40, yPercent: 28, widthPercent: 11, heightPercent: 42 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-blue', xPercent: 51, yPercent: 28, widthPercent: 11, heightPercent: 42 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-purple', xPercent: 62, yPercent: 28, widthPercent: 11, heightPercent: 42 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-black', xPercent: 73, yPercent: 28, widthPercent: 11, heightPercent: 42 },
  { sceneSlug: 'scene-colors-balloons', vocabSlug: 'color-white', xPercent: 84, yPercent: 28, widthPercent: 11, heightPercent: 42 },

  // scene-family-home: left to right — older brother (red hair, orange hoodie),
  // mom (blue hair, yellow dress), dad (brown hair, green sweater), older
  // sister (purple hair, pink dress)
  { sceneSlug: 'scene-family-home', vocabSlug: 'older-brother', xPercent: 6, yPercent: 25, widthPercent: 24, heightPercent: 65 },
  { sceneSlug: 'scene-family-home', vocabSlug: 'mom', xPercent: 28, yPercent: 12, widthPercent: 24, heightPercent: 78 },
  { sceneSlug: 'scene-family-home', vocabSlug: 'dad', xPercent: 48, yPercent: 10, widthPercent: 24, heightPercent: 80 },
  { sceneSlug: 'scene-family-home', vocabSlug: 'older-sister', xPercent: 70, yPercent: 22, widthPercent: 24, heightPercent: 68 },

  // scene-family-school: left to right — younger brother, younger sister,
  // teacher (pointing at a classroom board)
  { sceneSlug: 'scene-family-school', vocabSlug: 'younger-brother', xPercent: 17, yPercent: 40, widthPercent: 22, heightPercent: 48 },
  { sceneSlug: 'scene-family-school', vocabSlug: 'younger-sister', xPercent: 38, yPercent: 40, widthPercent: 20, heightPercent: 50 },
  { sceneSlug: 'scene-family-school', vocabSlug: 'teacher', xPercent: 56, yPercent: 10, widthPercent: 30, heightPercent: 85 },
]
