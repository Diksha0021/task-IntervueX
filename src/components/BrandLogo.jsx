export const LOGO_MARK = 'iX'

const SIZES = {
  sm: { markW: 44, markH: 38, markFont: 14, name: 20 },
  md: { markW: 48, markH: 40, markFont: 15, name: 22 },
  lg: { markW: 56, markH: 48, markFont: 17, name: 28 },
}

/**
 * IntervueX brand mark (iX) + wordmark — used on login and nav.
 */
export function BrandLogo({
  size = 'md',
  layout = 'row',
  showName = true,
  subtitle,
  className = '',
}) {
  const s = SIZES[size] ?? SIZES.md
  const stacked = layout === 'stack'

  return (
    <div
      className={`${stacked ? 'flex flex-col items-center text-center gap-3' : 'flex items-center gap-3'} ${className}`}
    >
      <div
        className="ix-logo-mark"
        style={{
          width: s.markW,
          height: s.markH,
          fontSize: s.markFont,
          letterSpacing: '-0.04em',
          borderRadius: Math.round(s.markH * 0.29),
        }}
        aria-hidden
      >
        {LOGO_MARK}
      </div>
      {showName && (
        <div>
          <div className="ix-logo-name" style={{ fontSize: s.name }}>
            Intervue<span>X</span>
          </div>
          {subtitle && (
            <p
              className="text-gray-400 mt-2 text-sm leading-relaxed"
              style={{ maxWidth: stacked ? 320 : undefined }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
