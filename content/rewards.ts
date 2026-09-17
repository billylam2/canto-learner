export interface PetSource {
  slug: string
  name: string
}

export interface AccessorySource {
  slug: string
  name: string
  cost: number
  xPercent: number
  yPercent: number
  widthPercent: number
}

// Turn this on once the pet reward system is ready for kids to see. It gates
// the "My Pet" nav links (level-select pages) and the /pet route itself
// (which redirects to /play while disabled) — nothing else needs to change
// to bring the feature back.
export const REWARDS_ENABLED = false

export const PET: PetSource = { slug: 'fox', name: 'Fox' }

export const ACCESSORIES: AccessorySource[] = [
  { slug: 'bow', name: 'Bow', cost: 10, xPercent: 58, yPercent: 15, widthPercent: 18 },
  { slug: 'glasses', name: 'Glasses', cost: 15, xPercent: 28, yPercent: 24, widthPercent: 42 },
  { slug: 'party-hat', name: 'Party Hat', cost: 20, xPercent: 27, yPercent: 0, widthPercent: 36 },
]
