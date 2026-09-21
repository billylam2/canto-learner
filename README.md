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

## Dub Sync admin tool

A separate, password-gated personal tool at `/dub-sync/admin` for building the Cantonese/English clip-pairing data used by `/dub-sync`. Requires two things beyond the main app's setup:

- **`DUB_SYNC_ADMIN_PASSWORD`** in `.env.local` — the single shared password for `/dub-sync/admin`, `/dub-sync/login`, and the episode/segment-editing API routes. The player at `/dub-sync/<episodeId>` itself stays open, unauthenticated.
- **[`yt-dlp`](https://github.com/yt-dlp/yt-dlp)** installed and on `PATH` wherever `npm run dev` (or however the app is served) runs — required by the "Transcribe Cantonese" button, which downloads the Cantonese video's audio temporarily (never kept or served) to transcribe it via Google Cloud Speech-to-Text (word timestamps only — speaker diarization was tried and dropped; Google doesn't support it for Cantonese at all, and it proved unreliable for English too). Also requires the Speech-to-Text API enabled on the same `GOOGLE_CLOUD_PROJECT` already used for text-to-speech.
- **`DUB_SYNC_GCS_BUCKET`** in `.env.local` — the name of a Google Cloud Storage bucket (e.g. created via `gsutil mb gs://<bucket-name>` or the console) that the transcription pipeline can read and write. Speech-to-Text requires audio longer than its inline-request limit to be passed as a `gs://` URI rather than embedded directly, so the downloaded audio is uploaded there temporarily and deleted again once transcription finishes — never kept or served.
- Apply `supabase/migrations/0006_create_dub_canto_words.sql` — adds the table that stores each episode's transcribed Cantonese word timestamps (used by the "Transcribe Cantonese" button to infer segment start times).
