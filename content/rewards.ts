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

export const PET: PetSource = { slug: 'fox', name: 'Fox' }

export const ACCESSORIES: AccessorySource[] = [
  { slug: 'bow', name: 'Bow', cost: 10, xPercent: 58, yPercent: 15, widthPercent: 18 },
  { slug: 'glasses', name: 'Glasses', cost: 15, xPercent: 28, yPercent: 24, widthPercent: 42 },
  { slug: 'party-hat', name: 'Party Hat', cost: 20, xPercent: 27, yPercent: 0, widthPercent: 36 },
]
