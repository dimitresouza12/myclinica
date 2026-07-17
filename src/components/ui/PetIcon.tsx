interface Props {
  species?: string | null
  size?: number
  className?: string
}

const COLORS: Record<string, string> = {
  Canino: '#C08552',
  Felino: '#F4A340',
  Ave: '#4DA8DA',
  Roedor: '#9A8C78',
  Coelho: '#D998C0',
  Réptil: '#5FAE72',
  Equino: '#8B6B4A',
}

export function PetIcon({ species, size = 18, className }: Props) {
  const key = species && COLORS[species] ? species : 'Outro'
  const color = COLORS[key] ?? '#8FA6A3'

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" style={{ flexShrink: 0 }}>
      {renderShape(key, color)}
    </svg>
  )
}

function renderShape(species: string, color: string) {
  switch (species) {
    case 'Canino':
      return (
        <g fill={color}>
          <ellipse cx="6.5" cy="9" rx="2.3" ry="3.2" transform="rotate(-30 6.5 9)" />
          <ellipse cx="17.5" cy="9" rx="2.3" ry="3.2" transform="rotate(30 17.5 9)" />
          <circle cx="12" cy="13.5" r="6" />
          <ellipse cx="12" cy="17.2" rx="2.1" ry="1.5" fillOpacity="0.35" />
        </g>
      )
    case 'Felino':
      return (
        <g fill={color}>
          <polygon points="5,10 8,3 9.6,10" />
          <polygon points="19,10 16,3 14.4,10" />
          <circle cx="12" cy="13.5" r="6" />
        </g>
      )
    case 'Ave':
      return (
        <g fill={color}>
          <ellipse cx="13" cy="15" rx="5.5" ry="6" />
          <circle cx="9" cy="8" r="3.5" />
          <polygon points="5.5,8 2,7 5.5,6.2" />
          <ellipse cx="14.5" cy="15" rx="2.8" ry="4.6" transform="rotate(18 14.5 15)" fillOpacity="0.3" />
        </g>
      )
    case 'Roedor':
      return (
        <g fill={color}>
          <circle cx="7.5" cy="8" r="2.2" />
          <circle cx="16.5" cy="8" r="2.2" />
          <circle cx="12" cy="13.5" r="6" />
        </g>
      )
    case 'Coelho':
      return (
        <g fill={color}>
          <ellipse cx="9" cy="5" rx="1.8" ry="4.5" />
          <ellipse cx="15" cy="5" rx="1.8" ry="4.5" />
          <circle cx="12" cy="14" r="5.8" />
        </g>
      )
    case 'Réptil':
      return (
        <g fill={color}>
          <ellipse cx="13" cy="14" rx="7" ry="3.2" transform="rotate(-15 13 14)" />
          <circle cx="6" cy="11" r="2.8" />
          <polygon points="19,15 23,17 20,18.5" />
        </g>
      )
    case 'Equino':
      return (
        <g fill={color}>
          <ellipse cx="12" cy="13" rx="4" ry="7.2" />
          <polygon points="9,6 10.5,1.8 12,6" />
          <polygon points="13,6 14.5,2.3 15.5,6.5" />
        </g>
      )
    default:
      return (
        <g fill={color}>
          <ellipse cx="12" cy="15.5" rx="4.5" ry="3.8" />
          <circle cx="7" cy="9" r="1.8" />
          <circle cx="10.5" cy="6.5" r="1.9" />
          <circle cx="14" cy="6.5" r="1.9" />
          <circle cx="17.5" cy="9" r="1.8" />
        </g>
      )
  }
}
