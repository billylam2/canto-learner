export type VocabCategory = 'greetings' | 'people' | 'family' | 'descriptors' | 'animals' | 'numbers' | 'colors'

export interface VocabSourceItem {
  slug: string
  category: VocabCategory
  level: number
  cantonese: string
  jyutping: string
  englishGloss: string
  description: string
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
  { id: 5, name: 'Colors', order: 5, unlockThreshold: 80 },
]

export const VOCAB_ITEMS: VocabSourceItem[] = [
  // Level 1: Greetings
  { slug: 'hello', category: 'greetings', level: 1, cantonese: '你好', jyutping: 'nei5 hou2', englishGloss: 'hello', description: 'two cartoon human children standing face to face, turned toward each other and looking directly at each other, both waving hello' },
  { slug: 'hello-everyone', category: 'greetings', level: 1, cantonese: '大家好', jyutping: 'daai6 gaa1 hou2', englishGloss: 'hello everyone', description: 'three human cartoon children standing together, all waving hello' },
  { slug: 'good-morning', category: 'greetings', level: 1, cantonese: '早晨', jyutping: 'zou2 san4', englishGloss: 'good morning', description: 'a cartoon kid sitting up in bed, looking sleepy, waving, with warm bright sunlight streaming into the room' },
  { slug: 'good-evening', category: 'greetings', level: 1, cantonese: '晚安', jyutping: 'maan5 on1', englishGloss: 'good evening', description: 'a cartoon kid looking sleepy in bed, waving, in a dark room lit only by a soft nightlight glow' },
  { slug: 'goodbye', category: 'greetings', level: 1, cantonese: '拜拜', jyutping: 'baai1 baai3', englishGloss: 'goodbye', description: 'a cartoon child walking away down a path, looking back over their shoulder with a big smile and waving goodbye' },
  { slug: 'thank-you', category: 'greetings', level: 1, cantonese: '唔該', jyutping: 'm4 goi1', englishGloss: 'thank you', description: 'a cartoon teacher receiving a bouquet of flowers and clasping her hands together with joy' },
  { slug: 'excuse-me', category: 'greetings', level: 1, cantonese: '唔好意思', jyutping: 'm4 hou2 ji3 si1', englishGloss: 'excuse me', description: 'a cartoon kid politely trying to get the attention of an adult teacher who is reading a book and not noticing them' },
  { slug: 'sorry', category: 'greetings', level: 1, cantonese: '對唔住', jyutping: 'deoi3 m4 zyu6', englishGloss: 'sorry', description: 'a cartoon kid standing next to a broken vase on the floor, looking sad and apologetic' },
  // Level 2: People & Family
  { slug: 'i-me', category: 'people', level: 2, cantonese: '我', jyutping: 'ngo5', englishGloss: 'I / me', description: 'a cartoon child pointing to themselves' },
  { slug: 'you', category: 'people', level: 2, cantonese: '你', jyutping: 'nei5', englishGloss: 'you', description: 'a cartoon child pointing forward at the viewer' },
  { slug: 'teacher', category: 'people', level: 2, cantonese: '老師', jyutping: 'lou5 si1', englishGloss: 'teacher', description: 'a friendly cartoon teacher standing next to a chalkboard' },
  { slug: 'mom', category: 'family', level: 2, cantonese: '媽媽', jyutping: 'maa4 maa1', englishGloss: 'mom', description: 'a cartoon mom with a small heart nearby' },
  { slug: 'dad', category: 'family', level: 2, cantonese: '爸爸', jyutping: 'baa4 baa1', englishGloss: 'dad', description: 'a cartoon dad with a small heart nearby' },
  { slug: 'older-brother', category: 'family', level: 2, cantonese: '哥哥', jyutping: 'go4 go1', englishGloss: 'older brother', description: 'a cartoon older brother, a taller boy' },
  { slug: 'younger-brother', category: 'family', level: 2, cantonese: '弟弟', jyutping: 'dai4 dai2', englishGloss: 'younger brother', description: 'a cartoon younger brother, a small boy' },
  { slug: 'older-sister', category: 'family', level: 2, cantonese: '姐姐', jyutping: 'ze4 ze1', englishGloss: 'older sister', description: 'a cartoon older sister, a taller girl with a bow in her hair' },
  { slug: 'younger-sister', category: 'family', level: 2, cantonese: '妹妹', jyutping: 'mui4 mui2', englishGloss: 'younger sister', description: 'a cartoon younger sister, a small girl with a bow in her hair' },
  // Level 3: Descriptors & Animals
  { slug: 'big', category: 'descriptors', level: 3, cantonese: '大', jyutping: 'daai6', englishGloss: 'big', description: 'a huge, comically oversized cartoon elephant, appearing enormous' },
  { slug: 'small', category: 'descriptors', level: 3, cantonese: '細', jyutping: 'sai3', englishGloss: 'small', description: 'a tiny cartoon mouse, appearing comically small, with lots of empty space around it' },
  { slug: 'cat', category: 'animals', level: 3, cantonese: '貓', jyutping: 'maau1', englishGloss: 'cat', description: 'a cute cartoon cat sitting down' },
  { slug: 'dog', category: 'animals', level: 3, cantonese: '狗', jyutping: 'gau2', englishGloss: 'dog', description: 'a cute cartoon dog sitting down', homophoneGroup: 'gau2' },
  // Level 4: Numbers
  { slug: 'number-1', category: 'numbers', level: 4, cantonese: '一', jyutping: 'jat1', englishGloss: 'one', description: 'the numeral 1 with one small dot below it' },
  { slug: 'number-2', category: 'numbers', level: 4, cantonese: '二', jyutping: 'ji6', englishGloss: 'two', description: 'the numeral 2 with two small dots below it' },
  { slug: 'number-3', category: 'numbers', level: 4, cantonese: '三', jyutping: 'saam1', englishGloss: 'three', description: 'the numeral 3 with three small dots below it' },
  { slug: 'number-4', category: 'numbers', level: 4, cantonese: '四', jyutping: 'sei3', englishGloss: 'four', description: 'the numeral 4 with four small dots below it' },
  { slug: 'number-5', category: 'numbers', level: 4, cantonese: '五', jyutping: 'ng5', englishGloss: 'five', description: 'the numeral 5 with five small dots below it' },
  { slug: 'number-6', category: 'numbers', level: 4, cantonese: '六', jyutping: 'luk6', englishGloss: 'six', description: 'the numeral 6 with six small loose dots below it arranged in two rows of three: three dots in the top row, three dots in the bottom row, six dots total, no box or frame around the dots' },
  { slug: 'number-7', category: 'numbers', level: 4, cantonese: '七', jyutping: 'cat1', englishGloss: 'seven', description: 'the numeral 7 with seven small dots below it' },
  { slug: 'number-8', category: 'numbers', level: 4, cantonese: '八', jyutping: 'baat3', englishGloss: 'eight', description: 'the numeral 8 with eight small loose dots below it arranged in two rows of four: four dots in the top row, four dots in the bottom row, eight dots total, no box or frame around the dots' },
  { slug: 'number-9', category: 'numbers', level: 4, cantonese: '九', jyutping: 'gau2', englishGloss: 'nine', description: 'the numeral 9 with nine small loose dots below it arranged in a 3 by 3 grid: three dots in the top row, three dots in the middle row, three dots in the bottom row, nine dots total, no box or frame around the dots', homophoneGroup: 'gau2' },
  { slug: 'number-10', category: 'numbers', level: 4, cantonese: '十', jyutping: 'sap6', englishGloss: 'ten', description: 'the numeral 10 with small loose dots below it in two short rows stacked one above the other: the top row has a first, second, third, fourth, and fifth dot; the bottom row has a sixth, seventh, eighth, ninth, and tenth dot; ten dots total and nothing below the second row, no box or frame around the dots' },
  // Level 5: Colors
  { slug: 'color-red', category: 'colors', level: 5, cantonese: '紅色', jyutping: 'hung4 sik1', englishGloss: 'red', description: 'a solid red paint splotch blob shape' },
  { slug: 'color-orange', category: 'colors', level: 5, cantonese: '橙色', jyutping: 'caang2 sik1', englishGloss: 'orange', description: 'a solid orange paint splotch blob shape' },
  { slug: 'color-yellow', category: 'colors', level: 5, cantonese: '黃色', jyutping: 'wong4 sik1', englishGloss: 'yellow', description: 'a solid yellow paint splotch blob shape' },
  { slug: 'color-green', category: 'colors', level: 5, cantonese: '綠色', jyutping: 'luk6 sik1', englishGloss: 'green', description: 'a solid green paint splotch blob shape' },
  { slug: 'color-blue', category: 'colors', level: 5, cantonese: '藍色', jyutping: 'laam4 sik1', englishGloss: 'blue', description: 'a solid blue paint splotch blob shape' },
  { slug: 'color-purple', category: 'colors', level: 5, cantonese: '紫色', jyutping: 'zi2 sik1', englishGloss: 'purple', description: 'a solid purple paint splotch blob shape' },
  { slug: 'color-black', category: 'colors', level: 5, cantonese: '黑色', jyutping: 'hak1 sik1', englishGloss: 'black', description: 'a solid black paint splotch blob shape' },
  { slug: 'color-white', category: 'colors', level: 5, cantonese: '白色', jyutping: 'baak6 sik1', englishGloss: 'white', description: 'a solid white paint splotch blob shape with a thin light gray outline so it is visible on a white background' },
]
