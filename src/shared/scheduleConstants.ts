export interface JamKbmSlot {
  id: number;
  label: string;
  mulai: string;
  selesai: string;
}

export const JAM_KBM_MATRIX: JamKbmSlot[] = [
  { id: 1, label: 'Jam ke-1', mulai: '07:00', selesai: '07:45' },
  { id: 2, label: 'Jam ke-2', mulai: '07:45', selesai: '08:30' },
  { id: 3, label: 'Jam ke-3', mulai: '08:30', selesai: '09:15' },
  { id: 4, label: 'Jam ke-4', mulai: '09:30', selesai: '10:15' },
  { id: 5, label: 'Jam ke-5', mulai: '10:15', selesai: '11:00' },
  { id: 6, label: 'Jam ke-6', mulai: '11:00', selesai: '11:45' },
  { id: 7, label: 'Jam ke-7', mulai: '12:15', selesai: '13:00' },
  { id: 8, label: 'Jam ke-8', mulai: '13:00', selesai: '13:45' },
  { id: 9, label: 'Jam ke-9', mulai: '13:45', selesai: '14:30' },
  { id: 10, label: 'Jam ke-10', mulai: '14:30', selesai: '15:15' },
];

export interface SesiWaktuSlot {
  tipe: 'KBM' | 'ISTIRAHAT';
  jamKe?: number;
  label?: string;
  mulai: string;
  selesai: string;
}

export const SESI_WAKTU_SEKOLAH: SesiWaktuSlot[] = [
  { tipe: 'KBM', jamKe: 1, mulai: '07:00', selesai: '07:45' },
  { tipe: 'KBM', jamKe: 2, mulai: '07:45', selesai: '08:30' },
  { tipe: 'KBM', jamKe: 3, mulai: '08:30', selesai: '09:15' },
  { tipe: 'ISTIRAHAT', label: 'Istirahat 1', mulai: '09:15', selesai: '09:30' },
  { tipe: 'KBM', jamKe: 4, mulai: '09:30', selesai: '10:15' },
  { tipe: 'KBM', jamKe: 5, mulai: '10:15', selesai: '11:00' },
  { tipe: 'KBM', jamKe: 6, mulai: '11:00', selesai: '11:45' },
  { tipe: 'ISTIRAHAT', label: 'Istirahat 2', mulai: '11:45', selesai: '12:15' },
  { tipe: 'KBM', jamKe: 7, mulai: '12:15', selesai: '13:00' },
  { tipe: 'KBM', jamKe: 8, mulai: '13:00', selesai: '13:45' },
  { tipe: 'KBM', jamKe: 9, mulai: '13:45', selesai: '14:30' },
  { tipe: 'KBM', jamKe: 10, mulai: '14:30', selesai: '15:15' },
];

export function timeToMinutes(hhmm: string): number {
  if (!hhmm || !hhmm.includes(':')) return -1;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

export function getTodayWIB(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

export function getTimeWIB(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}

export function getNamaHariWIB(dateStr?: string, offsetMs = 0): string {
  const clean = String(dateStr || getTodayWIB(offsetMs)).trim().substring(0, 10);
  const p = clean.split('-');
  const d =
    p.length === 3
      ? new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))
      : new Date(Date.now() + offsetMs);
  const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return hariArr[d.getDay()] ?? 'Senin';
}

export function formatHariTanggal(dateString?: string): string {
  if (!dateString) return '-';
  const clean = String(dateString).trim().substring(0, 10);
  const p = clean.split('-');
  if (p.length !== 3) return dateString;
  const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  if (Number.isNaN(d.getTime())) return dateString;
  const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanArr = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  return `${hariArr[d.getDay()]}, ${d.getDate()} ${bulanArr[d.getMonth()]} ${d.getFullYear()}`;
}

export function parseJamKeRangeFromJadwal(jamStr: string): {
  start: number | null;
  end: number | null;
  label: string;
  startTime: string | null;
  endTime: string | null;
} {
  const s = String(jamStr || '');
  const nums = s.match(/jam\s*ke[-\s]*(\d+)/gi);
  if (nums && nums.length >= 2) {
    const start = parseInt(nums[0].replace(/\D/g, ''), 10);
    const end = parseInt(nums[1].replace(/\D/g, ''), 10);
    const slotStart = JAM_KBM_MATRIX.find((j) => j.id === start);
    const slotEnd = JAM_KBM_MATRIX.find((j) => j.id === end);
    return {
      start,
      end,
      label: `Jam ke-${start} s/d Jam ke-${end}`,
      startTime: slotStart?.mulai ?? null,
      endTime: slotEnd?.selesai ?? null,
    };
  }
  if (nums && nums.length === 1) {
    const single = parseInt(nums[0].replace(/\D/g, ''), 10);
    const slot = JAM_KBM_MATRIX.find((j) => j.id === single);
    return {
      start: single,
      end: single,
      label: `Jam ke-${single}`,
      startTime: slot?.mulai ?? null,
      endTime: slot?.selesai ?? null,
    };
  }
  const timeMatches = s.match(/(\d{2}:\d{2})/g);
  if (timeMatches && timeMatches.length >= 2) {
    const startMin = timeToMinutes(timeMatches[0]);
    const endMin = timeToMinutes(timeMatches[1]);
    const matched = JAM_KBM_MATRIX.filter(
      (j) => timeToMinutes(j.mulai) >= startMin && timeToMinutes(j.selesai) <= endMin
    );
    if (matched.length > 0) {
      const st = matched[0].id;
      const en = matched[matched.length - 1].id;
      return {
        start: st,
        end: en,
        label: st === en ? `Jam ke-${st}` : `Jam ke-${st} s/d Jam ke-${en}`,
        startTime: matched[0].mulai,
        endTime: matched[matched.length - 1].selesai,
      };
    }
  }
  return { start: null, end: null, label: s || '-', startTime: null, endTime: null };
}

export function hitungJarakMeter(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
