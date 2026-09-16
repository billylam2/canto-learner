interface StarRatingProps {
  stars: number
}

export function StarRating({ stars }: StarRatingProps) {
  return (
    <span className="inline-flex items-center gap-1 font-bold text-brand-ink">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="w-5 h-5 fill-brand-star stroke-brand-ink"
        strokeWidth={1.5}
      >
        <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.6z" />
      </svg>
      <span>{stars} stars</span>
    </span>
  )
}
