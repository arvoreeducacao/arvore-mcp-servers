import type { Priority } from "../types";

interface PriorityIconProps {
  priority: Priority;
  className?: string;
}

function UrgentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 14L8 2L13 14H3Z"
        fill="#f97316"
        stroke="#f97316"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.5V10"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="12" r="0.75" fill="white" />
    </svg>
  );
}

function HighIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="10" width="3" height="4" rx="0.5" fill="#f97316" />
      <rect x="6.5" y="6" width="3" height="8" rx="0.5" fill="#f97316" />
      <rect x="11" y="2" width="3" height="12" rx="0.5" fill="#f97316" />
    </svg>
  );
}

function MediumIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="10" width="3" height="4" rx="0.5" fill="#eab308" />
      <rect x="6.5" y="6" width="3" height="8" rx="0.5" fill="#eab308" />
      <rect
        x="11"
        y="2"
        width="3"
        height="12"
        rx="0.5"
        fill="none"
        stroke="#555577"
        strokeWidth="1"
      />
    </svg>
  );
}

function LowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="10" width="3" height="4" rx="0.5" fill="#3b82f6" />
      <rect
        x="6.5"
        y="6"
        width="3"
        height="8"
        rx="0.5"
        fill="none"
        stroke="#555577"
        strokeWidth="1"
      />
      <rect
        x="11"
        y="2"
        width="3"
        height="12"
        rx="0.5"
        fill="none"
        stroke="#555577"
        strokeWidth="1"
      />
    </svg>
  );
}

function NoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="2"
        y="10"
        width="3"
        height="4"
        rx="0.5"
        fill="none"
        stroke="#555577"
        strokeWidth="1"
      />
      <rect
        x="6.5"
        y="6"
        width="3"
        height="8"
        rx="0.5"
        fill="none"
        stroke="#555577"
        strokeWidth="1"
      />
      <rect
        x="11"
        y="2"
        width="3"
        height="12"
        rx="0.5"
        fill="none"
        stroke="#555577"
        strokeWidth="1"
      />
    </svg>
  );
}

const PRIORITY_ICONS: Record<Priority, React.FC> = {
  urgent: UrgentIcon,
  high: HighIcon,
  medium: MediumIcon,
  low: LowIcon,
  none: NoneIcon,
};

export function PriorityIcon({ priority, className }: PriorityIconProps) {
  const Icon = PRIORITY_ICONS[priority];
  return (
    <span className={className}>
      <Icon />
    </span>
  );
}
