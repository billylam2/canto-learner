export interface Hotspot {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

// Kids tap imprecisely, so every authored hotspot is treated as larger than
// its stored rectangle by this many percentage points on each side.
const TAP_PADDING_PERCENT = 5

export function isPointInHotspot(xPercent: number, yPercent: number, hotspot: Hotspot): boolean {
  const left = Math.max(0, hotspot.xPercent - TAP_PADDING_PERCENT)
  const right = Math.min(100, hotspot.xPercent + hotspot.widthPercent + TAP_PADDING_PERCENT)
  const top = Math.max(0, hotspot.yPercent - TAP_PADDING_PERCENT)
  const bottom = Math.min(100, hotspot.yPercent + hotspot.heightPercent + TAP_PADDING_PERCENT)

  return xPercent >= left && xPercent <= right && yPercent >= top && yPercent <= bottom
}
