export type VocabCategory = 'greetings' | 'people' | 'family' | 'descriptors' | 'animals' | 'numbers'

export interface VocabSourceItem {
  slug: string
  category: VocabCategory
  level: number
  cantonese: string
  jyutping: string
  englishGloss: string
  homophoneGroup?: string
}

export interface LevelSource {
  id: number
  name: string
  order: number
  unlockThreshold: number
}

export const LEVELS: LevelSource[] = [
  { id: 1, name: 'Greetings', order: 1, unlockThreshold: 0 },
  { id: 2, name: 'People & Family', order: 2, unlockThreshold: 20 },
  { id: 3, name: 'Descriptors & Animals', order: 3, unlockThreshold: 40 },
  { id: 4, name: 'Numbers', order: 4, unlockThreshold: 60 },
]

export const VOCAB_ITEMS: VocabSourceItem[] = [
  // Level 1: Greetings
  { slug: 'hello', category: 'greetings', level: 1, cantonese: '你好', jyutping: 'nei5 hou2', englishGloss: 'hello' },
  { slug: 'hello-everyone', category: 'greetings', level: 1, cantonese: '大家好', jyutping: 'daai6 gaa1 hou2', englishGloss: 'hello everyone' },
  { slug: 'good-morning', category: 'greetings', level: 1, cantonese: '早晨', jyutping: 'zou2 san4', englishGloss: 'good morning' },
  { slug: 'good-evening', category: 'greetings', level: 1, cantonese: '晚安', jyutping: 'maan5 on1', englishGloss: 'good evening' },
  { slug: 'goodbye', category: 'greetings', level: 1, cantonese: '拜拜', jyutping: 'baai1 baai3', englishGloss: 'goodbye' },
  { slug: 'thank-you', category: 'greetings', level: 1, cantonese: '唔該', jyutping: 'm4 goi1', englishGloss: 'thank you' },
  { slug: 'excuse-me', category: 'greetings', level: 1, cantonese: '唔好意思', jyutping: 'm4 hou2 ji3 si1', englishGloss: 'excuse me' },
  { slug: 'sorry', category: 'greetings', level: 1, cantonese: '對唔住', jyutping: 'deoi3 m4 zyu6', englishGloss: 'sorry' },
  // Level 2: People & Family
  { slug: 'i-me', category: 'people', level: 2, cantonese: '我', jyutping: 'ngo5', englishGloss: 'I / me' },
  { slug: 'you', category: 'people', level: 2, cantonese: '你', jyutping: 'nei5', englishGloss: 'you' },
  { slug: 'teacher', category: 'people', level: 2, cantonese: '老師', jyutping: 'lou5 si1', englishGloss: 'teacher' },
  { slug: 'mom', category: 'family', level: 2, cantonese: '媽媽', jyutping: 'maa4 maa1', englishGloss: 'mom' },
  { slug: 'dad', category: 'family', level: 2, cantonese: '爸爸', jyutping: 'baa4 baa1', englishGloss: 'dad' },
  { slug: 'older-brother', category: 'family', level: 2, cantonese: '哥哥', jyutping: 'go4 go1', englishGloss: 'older brother' },
  { slug: 'younger-brother', category: 'family', level: 2, cantonese: '弟弟', jyutping: 'dai4 dai2', englishGloss: 'younger brother' },
  { slug: 'older-sister', category: 'family', level: 2, cantonese: '姐姐', jyutping: 'ze4 ze1', englishGloss: 'older sister' },
  { slug: 'younger-sister', category: 'family', level: 2, cantonese: '妹妹', jyutping: 'mui4 mui2', englishGloss: 'younger sister' },
  // Level 3: Descriptors & Animals
  { slug: 'big', category: 'descriptors', level: 3, cantonese: '大', jyutping: 'daai6', englishGloss: 'big' },
  { slug: 'small', category: 'descriptors', level: 3, cantonese: '細', jyutping: 'sai3', englishGloss: 'small' },
  { slug: 'cat', category: 'animals', level: 3, cantonese: '貓', jyutping: 'maau1', englishGloss: 'cat' },
  { slug: 'dog', category: 'animals', level: 3, cantonese: '狗', jyutping: 'gau2', englishGloss: 'dog', homophoneGroup: 'gau2' },
  // Level 4: Numbers
  { slug: 'number-1', category: 'numbers', level: 4, cantonese: '一', jyutping: 'jat1', englishGloss: 'one' },
  { slug: 'number-2', category: 'numbers', level: 4, cantonese: '二', jyutping: 'ji6', englishGloss: 'two' },
  { slug: 'number-3', category: 'numbers', level: 4, cantonese: '三', jyutping: 'saam1', englishGloss: 'three' },
  { slug: 'number-4', category: 'numbers', level: 4, cantonese: '四', jyutping: 'sei3', englishGloss: 'four' },
  { slug: 'number-5', category: 'numbers', level: 4, cantonese: '五', jyutping: 'ng5', englishGloss: 'five' },
  { slug: 'number-6', category: 'numbers', level: 4, cantonese: '六', jyutping: 'luk6', englishGloss: 'six' },
  { slug: 'number-7', category: 'numbers', level: 4, cantonese: '七', jyutping: 'cat1', englishGloss: 'seven' },
  { slug: 'number-8', category: 'numbers', level: 4, cantonese: '八', jyutping: 'baat3', englishGloss: 'eight' },
  { slug: 'number-9', category: 'numbers', level: 4, cantonese: '九', jyutping: 'gau2', englishGloss: 'nine', homophoneGroup: 'gau2' },
  { slug: 'number-10', category: 'numbers', level: 4, cantonese: '十', jyutping: 'sap6', englishGloss: 'ten' },
]
