import { SportIconKey } from '../types/models';

export const ICON_FILTER = 'none';

export const SPORT_ICON_OPTIONS: { key: SportIconKey; label: string }[] = [
  { key: 'pawn', label: 'Pawn' },
  { key: 'tileS', label: 'S Tile' },
  { key: 'cubeW', label: 'W Cube' },
  { key: 'shuttlecock', label: 'Shuttle' },
  { key: 'dartboard', label: 'Dartboard' },
  { key: 'stars3', label: '3 Stars' },
  { key: 'conch', label: 'Conch' },
  { key: 'paddle', label: 'Paddle' },
  { key: 'basketball', label: 'Basketball' },
  { key: 'volleyball', label: 'Volleyball' },
];

const SPORT_ICON_SRC: Record<SportIconKey, string> = {
  pawn: '/icons/pawn.png',
  tileS: '/icons/tileS.png',
  cubeW: '/icons/cubeW.png',
  shuttlecock: '/icons/shuttlecock.png',
  dartboard: '/icons/dartboard.png',
  stars3: '/icons/stars3.png',
  conch: '/icons/conch.png',
  paddle: '/icons/paddle.png',
  basketball: '/icons/basketball.png',
  volleyball: '/icons/volleyball.png',
};

interface SportIconProps {
  iconKey: SportIconKey | 'none' | string | null | undefined;
  size?: number;
  className?: string;
}

export function SportIcon({ iconKey, size = 20, className = '' }: SportIconProps) {
  if (!iconKey || iconKey === 'none') return null;
  const src = SPORT_ICON_SRC[iconKey as SportIconKey];
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden={true}
      draggable={false}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        filter: ICON_FILTER,
      }}
      className={`shrink-0 ${className}`.trim()}
    />
  );
}

interface SportIconPickerProps {
  value: SportIconKey | null;
  onChange: (value: SportIconKey | null) => void;
}

export function SportIconPicker({ value, onChange }: SportIconPickerProps) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        title="None"
        aria-label="None"
        className={`min-h-[48px] p-2 rounded-xl border flex items-center justify-center transition-colors duration-150 ${
          value === null
            ? 'border-fg ring-2 ring-fg bg-nested text-fg'
            : 'border-edge bg-nested text-fg-muted hover:text-fg'
        }`}
      >
        <span className="text-base font-medium leading-none" aria-hidden={true}>
          —
        </span>
      </button>

      {SPORT_ICON_OPTIONS.map(({ key, label }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={label}
            aria-label={label}
            className={`min-h-[48px] p-2 rounded-xl border flex items-center justify-center transition-colors duration-150 ${
              selected
                ? 'border-fg ring-2 ring-fg bg-nested text-fg'
                : 'border-edge bg-nested text-fg-muted hover:text-fg'
            }`}
          >
            <SportIcon iconKey={key} size={28} />
          </button>
        );
      })}
    </div>
  );
}
