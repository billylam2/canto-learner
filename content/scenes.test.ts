import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
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

describe('scene content coverage', () => {
  it('covers exactly dog, cat, big, and small for the dog-cat scene', () => {
    const slugs = SCENE_OBJECTS.filter((object) => object.sceneSlug === 'scene-dog-cat').map((object) => object.vocabSlug)
    expect(new Set(slugs)).toEqual(new Set(['dog', 'cat', 'big', 'small']))
  })

  it('covers exactly the 8 color words for the balloons scene', () => {
    const slugs = SCENE_OBJECTS.filter((object) => object.sceneSlug === 'scene-colors-balloons').map(
      (object) => object.vocabSlug
    )
    expect(new Set(slugs)).toEqual(
      new Set([
        'color-red',
        'color-orange',
        'color-yellow',
        'color-green',
        'color-blue',
        'color-purple',
        'color-black',
        'color-white',
      ])
    )
  })

  it('covers exactly the 7 findable people/family words across level 2 scenes, excluding pronouns', () => {
    const level2SceneSlugs = new Set(SCENES.filter((scene) => scene.levelId === 2).map((scene) => scene.slug))
    const slugs = SCENE_OBJECTS.filter((object) => level2SceneSlugs.has(object.sceneSlug)).map(
      (object) => object.vocabSlug
    )
    expect(new Set(slugs)).toEqual(
      new Set(['teacher', 'mom', 'dad', 'older-brother', 'younger-brother', 'older-sister', 'younger-sister'])
    )
    expect(slugs).not.toContain('i-me')
    expect(slugs).not.toContain('you')
  })

  it('keeps every hotspot rectangle within the 0-100 percent image bounds', () => {
    for (const object of SCENE_OBJECTS) {
      expect(object.xPercent).toBeGreaterThanOrEqual(0)
      expect(object.yPercent).toBeGreaterThanOrEqual(0)
      expect(object.xPercent + object.widthPercent).toBeLessThanOrEqual(100)
      expect(object.yPercent + object.heightPercent).toBeLessThanOrEqual(100)
    }
  })
})

describe('scene images', () => {
  it('has a matching PNG image file for every scene', () => {
    for (const scene of SCENES) {
      const imagePath = path.resolve(import.meta.dirname, 'images', 'scenes', `${scene.slug}.png`)
      expect(existsSync(imagePath)).toBe(true)
    }
  })
})
