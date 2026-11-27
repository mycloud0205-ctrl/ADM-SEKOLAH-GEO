import React from 'react';
import type { AttendanceStatus } from '../shared/types';

export interface StatusOptionConfig {
  value: AttendanceStatus;
  label: string;
  shortLabel: string;
  activeClass: string;
  inactiveClass: string;
  badgeClass: string;
}

export const ATTENDANCE_STATUS_OPTIONS: StatusOptionConfig[] = [
  {
    value: 'Hadir',
    label: 'Hadir',
    shortLabel: 'H',
    activeClass:
      'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30',
    inactiveClass:
      'bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50',
    badgeClass:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  {
    value: 'Izin',
    label: 'Ijin',
    shortLabel: 'I',
    activeClass:
      'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-500/30',
    inactiveClass:
      'bg-blue-50/60 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/50',
    badgeClass:
      'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  {
    value: 'Sakit',
    label: 'Sakit',
    shortLabel: 'S',
    activeClass:
      'bg-yellow-400 text-slate-950 border-yellow-500 shadow-sm ring-2 ring-yellow-400/40',
    inactiveClass:
      'bg-yellow-50/80 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700/60 hover:bg-yellow-100 dark:hover:bg-yellow-900/50',
    badgeClass:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700',
  },
  {
    value: 'Alpa',
    label: 'Alpha',
    shortLabel: 'A',
    activeClass:
      'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30',
    inactiveClass:
      'bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60 hover:bg-red-100 dark:hover:bg-red-900/50',
    badgeClass:
      'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800',
  },
  {
    value: 'Terlambat',
    label: 'Terlambat',
    shortLabel: 'T',
    activeClass:
      'bg-orange-500 text-white border-orange-600 shadow-sm ring-2 ring-orange-500/30',
    inactiveClass:
      'bg-orange-50/60 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60 hover:bg-orange-100 dark:hover:bg-orange-900/50',
    badgeClass:
      'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  },
];

export function normalizeAttendanceStatus(raw?: string): AttendanceStatus {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'izin' || s === 'ijin') return 'Izin';
  if (s === 'sakit') return 'Sakit';
  if (s === 'alpa' || s === 'alpha') return 'Alpa';
  if (s === 'terlambat') return 'Terlambat';
  return 'Hadir';
}

export function getStatusConfig(status?: string): StatusOptionConfig {
  const norm = normalizeAttendanceStatus(status);
  return ATTENDANCE_STATUS_OPTIONS.find((o) => o.value === norm) || ATTENDANCE_STATUS_OPTIONS[0];
}

interface AttendanceStatusButtonsProps {
  value: AttendanceStatus | string;
  onChange: (status: AttendanceStatus) => void;
  size?: 'sm' | 'md';
}

export const AttendanceStatusButtons: React.FC<AttendanceStatusButtonsProps> = ({
  value,
  onChange,
  size = 'sm',
}) => {
  const trimmed = String(value || '').trim();
  const current = trimmed ? normalizeAttendanceStatus(trimmed) : null;
  const paddingClass = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
      {ATTENDANCE_STATUS_OPTIONS.map((opt) => {
        const isSelected = current !== null && current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(opt.value)}
            className={`${paddingClass} rounded-lg font-bold border transition-all whitespace-nowrap cursor-pointer ${
              isSelected ? opt.activeClass : opt.inactiveClass
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export const AttendanceStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const cfg = getStatusConfig(status);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cfg.badgeClass}`}
    >
      {cfg.label}
    </span>
  );
};
