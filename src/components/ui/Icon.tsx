import type { SVGProps } from 'react'

type IconName =
  | 'dashboard' | 'patients' | 'calendar' | 'finance'
  | 'team' | 'settings' | 'admin' | 'logout'
  | 'sun' | 'moon' | 'chevronLeft' | 'chevronRight' | 'menu'
  | 'crm' | 'stock' | 'reports' | 'campaigns'

const PATHS: Record<IconName, string> = {
  dashboard:    'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  patients:     'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 7a4 4 0 110 8 4 4 0 010-8z',
  calendar:     'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  finance:      'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  team:         'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M20 4a4 4 0 010 7.75',
  settings:     'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8v8M8 12h8',
  admin:        'M12 2l9 4v6c0 5.5-3.8 10.7-9 12C6.8 22.7 3 17.5 3 12V6l9-4z',
  logout:       'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  sun:          'M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 7a5 5 0 100 10 5 5 0 000-10z',
  moon:         'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  chevronLeft:  'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  menu:         'M3 12h18M3 6h18M3 18h18',
  crm:          'M22 12h-4l-3 9L9 3l-3 9H2',
  stock:        'M5 8h14M5 8a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v0a2 2 0 01-2 2M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12h4',
  reports:      'M18 20V10M12 20V4M6 20v-6',
  campaigns:    'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 .82h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z',
}

interface Props extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 16, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {PATHS[name].split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={`M${seg}`} />
      ))}
    </svg>
  )
}
