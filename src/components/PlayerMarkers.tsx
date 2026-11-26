import { EntrySlot } from '../types/models';

export const MARKER_SIZE = 14;

const CHURCH_HUES: ReadonlyArray<{ bg: string; color: string }> = [
  { bg: 'rgba(56, 189, 248, 0.22)', color: '#7DD3FC' },
  { bg: 'rgba(52, 211, 153, 0.22)', color: '#6EE7B7' },
  { bg: 'rgba(251, 191, 36, 0.22)', color: '#FCD34D' },
  { bg: 'rgba(167, 139, 250, 0.22)', color: '#C4B5FD' },
  { bg: 'rgba(244, 114, 182, 0.22)', color: '#F9A8D4' },
  { bg: 'rgba(251, 146, 60, 0.22)', color: '#FDBA74' },
];

function hashChurchIndex(church: string): number {
  let hash = 0;
  const normalized = church.toLowerCase();
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % CHURCH_HUES.length;
}

export function ChurchMarker({ church }: { church?: string | null }) {
  const trimmed = (church ?? '').trim();
  if (!trimmed) return null;
  const hue = CHURCH_HUES[hashChurchIndex(trimmed)];
  const letter = trimmed.charAt(0).toUpperCase();

  return (
    <span
      title={trimmed}
      aria-label={trimmed}
      style={{
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        backgroundColor: hue.bg,
        color: hue.color,
      }}
      className="rounded-full text-[9px] font-semibold leading-none inline-flex items-center justify-center shrink-0 select-none"
    >
      {letter}
    </span>
  );
}

export function SlotBadge({ slot }: { slot: EntrySlot | undefined }) {
  if (slot !== 'secondary' && slot !== 'tertiary') return null;
  const label = slot === 'secondary' ? 'Secondary sport' : 'Tertiary sport';

  return (
    <span
      title={label}
      aria-label={label}
      style={{ width: MARKER_SIZE, height: MARKER_SIZE }}
      className="rounded-full border border-fg-muted text-fg-muted text-[9px] font-semibold leading-none inline-flex items-center justify-center shrink-0 select-none"
    >
      {slot === 'secondary' ? '2' : '3'}
    </span>
  );
}

export function PlayerNameWithChurch({
  name,
  church,
  className,
}: {
  name: string;
  church?: string | null;
  className?: string;
}) {
  const trimmedChurch = (church ?? '').trim();
  if (!trimmedChurch) {
    return className ? <span className={className}>{name}</span> : <>{name}</>;
  }

  const trimmedName = name.trim();
  const lastSpace = trimmedName.lastIndexOf(' ');
  const head = lastSpace > 0 ? trimmedName.slice(0, lastSpace) : '';
  const tail = lastSpace > 0 ? trimmedName.slice(lastSpace + 1) : trimmedName;

  return (
    <span className={className}>
      {head ? `${head} ` : null}
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span>{tail}</span>
        <ChurchMarker church={trimmedChurch} />
      </span>
    </span>
  );
}
