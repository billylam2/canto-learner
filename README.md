# Canto

A gamified web app that teaches beginner Cantonese vocabulary to kids ages 3-6.

## Development

```bash
npm install
npm run dev      # start the dev server
npm test         # run the test suite
npm run lint     # lint
npm run build    # production build
```

Scripts that talk to Google Cloud or Supabase (see below) need `.env.local` and the `GOOGLE_CLOUD_PROJECT` environment variable, and are run with `tsx --env-file=.env.local`, e.g. `npm run sync-content`.

## Content pipeline

Vocab words live in `content/vocab.ts`. Each item has a `description` (the prompt used for AI image generation) and a `cantonese` field (the text sent to text-to-speech for the spoken audio).

- `npm run generate-images` — regenerates vocab icon images from their descriptions (accepts optional slugs to regenerate a subset, e.g. `npm run generate-images -- hello goodbye`).
- `npm run generate-one -- <output-path.png> "<description>" ["<style override>"]` — generates a single image with a custom prompt, for one-off tweaks.
- `npm run generate-scenes` / `npm run sync-scenes` — same idea for the Find-in-Scene game's scene images (also accept optional slugs).
- `npm run sync-content` — uploads vocab images and audio to Supabase Storage and upserts the database rows. Accepts optional slugs to sync a subset, e.g. `npm run sync-content -- hello goodbye`.

### Using your own recorded audio instead of AI-generated speech

By default, `npm run sync-content` synthesizes each vocab item's spoken audio with Google Cloud Text-to-Speech from its `cantonese` field. If you'd rather use a real recording (your own voice, a native speaker, etc.), you can override the AI audio on a per-item basis:

1. Record the word or phrase and export it as an **MP3**.
2. Save it at `content/audio/<slug>.mp3`, where `<slug>` matches the vocab item's `slug` field in `content/vocab.ts` (e.g. `content/audio/hello.mp3` for the `hello` item). Create the `content/audio/` directory if it doesn't exist yet.
3. Run `npm run sync-content -- <slug>` (e.g. `npm run sync-content -- hello`) to sync just that item.

When `content/audio/<slug>.mp3` exists, `sync-content` uploads it as-is instead of calling text-to-speech — no other code changes needed. Passing the slug (rather than running the full sync) avoids re-synthesizing and re-uploading every other item unnecessarily.

To go back to AI-generated audio for an item, delete its file from `content/audio/` and re-run `npm run sync-content -- <slug>`.

Recorded audio files in `content/audio/` are treated as real content and should be committed to the repo, the same as the generated images in `content/images/`.
