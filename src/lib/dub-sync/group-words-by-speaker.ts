export interface TranscribedWord {
  text: string
  startTime: number
  endTime: number
  speakerTag: number
}

export interface WordGroup {
  start: number
  end: number
}

export function groupWordsBySpeaker(words: TranscribedWord[]): WordGroup[] {
  const groups: WordGroup[] = []

  for (const word of words) {
    const lastWord = words[words.indexOf(word) - 1]
    const currentGroup = groups[groups.length - 1]

    if (currentGroup && lastWord && lastWord.speakerTag === word.speakerTag) {
      currentGroup.end = word.endTime
    } else {
      groups.push({ start: word.startTime, end: word.endTime })
    }
  }

  return groups
}
