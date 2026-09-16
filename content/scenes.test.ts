import { describe, it, expect } from 'vitest'
import { LEVELS, VOCAB_ITEMS } from './vocab'
import { SCENES, SCENE_OBJECTS } from './scenes'

describe('scene content', () => {
  it('has a unique slug for every scene', () => {
    const slugs = SCENES.map((scene) => scene.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('references only levels that exist', () => {
    const levelIds = new Set(LEVELS.map((level) => level.id))
    for (const scene of SCENES) {
      expect(levelIds.has(scene.levelId)).toBe(true)
    }
  })

  it('has a non-empty name and description for every scene', () => {
    for (const scene of SCENES) {
      expect(scene.name.length).toBeGreaterThan(0)
      expect(scene.description.length).toBeGreaterThan(0)
    }
  })

  it('has at least one scene for levels 2, 3, and 5', () => {
    const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
    expect(levelIdsWithScenes.has(2)).toBe(true)
    expect(levelIdsWithScenes.has(3)).toBe(true)
    expect(levelIdsWithScenes.has(5)).toBe(true)
  })

  it('has no scenes for levels 1 and 4', () => {
    const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
    expect(levelIdsWithScenes.has(1)).toBe(false)
    expect(levelIdsWithScenes.has(4)).toBe(false)
  })

  it('references only scene slugs and vocab slugs that exist', () => {
    const sceneSlugs = new Set(SCENES.map((scene) => scene.slug))
    const vocabSlugs = new Set(VOCAB_ITEMS.map((item) => item.slug))
    for (const object of SCENE_OBJECTS) {
      expect(sceneSlugs.has(object.sceneSlug)).toBe(true)
      expect(vocabSlugs.has(object.vocabSlug)).toBe(true)
    }
  })
})
