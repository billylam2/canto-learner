import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EpisodeSidebar } from './episode-sidebar'

const episodeA = {
  id: 'ep-a',
  title: 'Muddy Puddles',
  cantoneseVideoId: 'canto-a',
  englishVideoId: 'eng-a',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}
const episodeB = {
  id: 'ep-b',
  title: 'Mr. Dinosaur Is Lost',
  cantoneseVideoId: 'canto-b',
  englishVideoId: 'eng-b',
  cantoContentStart: null,
  cantoContentEnd: null,
  englishContentStart: null,
  englishContentEnd: null,
}

describe('EpisodeSidebar', () => {
  it('lists every episode as a link to its player page', () => {
    render(<EpisodeSidebar episodes={[episodeA, episodeB]} currentEpisodeId="ep-a" />)

    expect(screen.getByRole('link', { name: /Muddy Puddles/ })).toHaveAttribute('href', '/dub-sync/ep-a')
    expect(screen.getByRole('link', { name: /Mr\. Dinosaur Is Lost/ })).toHaveAttribute('href', '/dub-sync/ep-b')
  })

  it('highlights the current episode', () => {
    render(<EpisodeSidebar episodes={[episodeA, episodeB]} currentEpisodeId="ep-b" />)

    expect(screen.getByRole('link', { name: /Muddy Puddles/ })).not.toHaveClass('bg-gray-200')
    expect(screen.getByRole('link', { name: /Mr\. Dinosaur Is Lost/ })).toHaveClass('bg-gray-200')
  })

  it('clamps long titles and gives every thumbnail the same fixed size, so rows stay a uniform height', () => {
    const longTitleEpisode = {
      ...episodeB,
      id: 'ep-c',
      title:
        'Cantonese Peppa Pig - S1E2 Mr. Dinosaur Is Lost (Canto spoken subs) / Peppa Pig Season 1 Episode 2 - Mr Dinosaur is Lost - Cartoons for Children',
    }
    const { container } = render(<EpisodeSidebar episodes={[episodeA, longTitleEpisode]} currentEpisodeId="ep-a" />)

    // Thumbnails are decorative (alt=""), so they're excluded from the accessibility tree —
    // queried directly rather than via getByRole.
    const images = container.querySelectorAll('img')
    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image).toHaveClass('w-24', 'h-[54px]')
    }

    expect(screen.getByText('Muddy Puddles')).toHaveClass('line-clamp-2')
    expect(screen.getByText(longTitleEpisode.title)).toHaveClass('line-clamp-2')
  })
})
