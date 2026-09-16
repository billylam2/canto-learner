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
    slug: 'scene-family',
    levelId: 2,
    name: 'Family and Teacher',
    description:
      'a family of six, mom, dad, and four children of different ages, posing together at home, with their teacher visiting',
  },
]

// Populated in the content-authoring task, after each scene image above has
// been generated and visually inspected — hotspot coordinates cannot be
// known before the raster image exists.
export const SCENE_OBJECTS: SceneObjectSource[] = []
