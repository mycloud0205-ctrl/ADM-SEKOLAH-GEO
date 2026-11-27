import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coffee,
  Layers,
  Radio,
  RefreshCw,
  UserX,
} from 'lucide-react';
import { ApiError, apiRequest, getAuthToken } from '../utils/api';
import {
  formatHariTanggal,
  getTimeWIB,
  parseJamKeRangeFromJadwal,
  SESI_WAKTU_SEKOLAH,
  timeToMinutes,
} from '../shared/scheduleConstants';
import type { JadwalRecord, KalenderRecord } from '../shared/types';

export type RombelColorLabel = 'Hijau' | 'Abu' | 'Merah' | 'Kuning';
export type TingkatGroup = 'Kelas X' | 'Kelas XI' | 'Kelas XII' | 'Lainnya';

export interface RombelStatusCard {
  kelas: string;
  tingkat: TingkatGroup;
  status: string;
  colorLabel: RombelColorLabel;
  guru: string;
  mapel: string;
  jamKe: string;
  ruang: string;
  guruCheckedIn: boolean;
  jurnalFilled: boolean;
}

interface LivePegawaiSummary {
  nama: string;
  status: string;
  waktuInput: string;
}

interface LiveJurnalSummary {
  kelas: string;
  mapel: string;
  guruNama: string;
  jamKe: string;
}

interface LiveRombelPayload {
  todayStr: string;
  todayHari: string;
  timeStr: string;
  currentSessionLabel: string;
  kalender?: KalenderRecord;
  kelasList?: string[];
  jadwalToday?: JadwalRecord[];
  hadirPegawaiToday?: LivePegawaiSummary[];
  jurnalToday?: LiveJurnalSummary[];
  rombels?: Array<{
    kelas: string;
    status: string;
    colorState: 'green' | 'gray' | 'red' | 'yellow';
    guru: string;
    mapel: string;
    jamKe: string;
    ruang: string;
    guruCheckedIn: boolean;
    jurnalFilled: boolean;
  }>;
}

interface LiveTeacherDashboardProps {
  liveTick: number;
}

const AUTO_REFRESH_INTERVAL_MS = 30_000;
const TINGKAT_ORDER: TingkatGroup[] = ['Kelas X', 'Kelas XI', 'Kelas XII', 'Lainnya'];

export function getTingkatGroup(kelas: string): TingkatGroup {
  const clean = String(kelas || '').trim().toUpperCase();
  if (/^XII(\s|$|-)/.test(clean)) return 'Kelas XII';
  if (/^XI(\s|$|-)/.test(clean)) return 'Kelas XI';
  if (/^X(\s|$|-)/.test(clean)) return 'Kelas X';
  return 'Lainnya';
}

function mapColorStateToLabel(colorState: 'green' | 'gray' | 'red' | 'yellow'): RombelColorLabel {
  switch (colorState) {
    case 'green':
      return 'Hijau';
    case 'yellow':
      return 'Kuning';
    case 'red':
      return 'Merah';
    default:
      return 'Abu';
  }
}

function calculateClassStatusColors(
  payload: LiveRombelPayload,
  currentTimeHHMM: string
): {
  sessionLabel: string;
  rombels: RombelStatusCard[];
} {
  if (!payload.kelasList || !payload.jadwalToday) {
    const fallback = (payload.rombels || []).map((r) => ({
      kelas: r.kelas,
      tingkat: getTingkatGroup(r.kelas),
      status: r.status,
      colorLabel: mapColorStateToLabel(r.colorState),
      guru: r.guru,
      mapel: r.mapel,
      jamKe: r.jamKe,
      ruang: r.ruang,
      guruCheckedIn: r.guruCheckedIn,
      jurnalFilled: r.jurnalFilled,
    }));
    return {
      sessionLabel: payload.currentSessionLabel || '-',
      rombels: fallback,
    };
  }

  const nowMin = timeToMinutes(currentTimeHHMM);
  const kalender = payload.kalender;
  const jadwalToday = payload.jadwalToday;
  const hadirPegawaiToday = payload.hadirPegawaiToday || [];
  const jurnalToday = payload.jurnalToday || [];

  const currentSession = SESI_WAKTU_SEKOLAH.find((sesi) => {
    const sMin = timeToMinutes(sesi.mulai);
    const eMin = timeToMinutes(sesi.selesai);
    return nowMin >= sMin && nowMin < eMin;
  });

  const sessionLabel = currentSession
    ? currentSession.tipe === 'ISTIRAHAT'
      ? currentSession.label || 'Istirahat'
      : `Jam ke-${currentSession.jamKe}`
    : 'Di Luar Jam KBM';

  const isHolidayOrNonEffective =
    kalender &&
    (kalender.modeKbm.toLowerCase() === 'libur' ||
      kalender.statusEfektif.toLowerCase() === 'tidak efektif');

  const rombels: RombelStatusCard[] = payload.kelasList.map((kelas) => {
    const tingkat = getTingkatGroup(kelas);
    const jadwalKelas = jadwalToday.filter((j) => j.kelas === kelas);

    // 1. Idle state ('Abu') when non-effective day / holiday
    if (isHolidayOrNonEffective) {
      return {
        kelas,
        tingkat,
        status: 'OFF',
        colorLabel: 'Abu',
        guru: '-',
        mapel: kalender?.keterangan || 'Libur / Tidak Efektif',
        jamKe: '-',
        ruang: '-',
        guruCheckedIn: false,
        jurnalFilled: false,
      };
    }

    // 2. Idle state ('Abu') during scheduled break (Istirahat)
    if (currentSession?.tipe === 'ISTIRAHAT') {
      return {
        kelas,
        tingkat,
        status: 'Istirahat',
        colorLabel: 'Abu',
        guru: '-',
        mapel: currentSession.label || 'Waktu Istirahat',
        jamKe: `${currentSession.mulai} - ${currentSession.selesai} WIB`,
        ruang: '-',
        guruCheckedIn: false,
        jurnalFilled: false,
      };
    }

    // 3. Active KBM session evaluation based on Jadwal Mengajar Guru & Jurnal Harian
    if (currentSession?.tipe === 'KBM' && currentSession.jamKe) {
      const aktifJamKe = currentSession.jamKe;
      const activeSlot = jadwalKelas.find((j) => {
        const range = parseJamKeRangeFromJadwal(j.jam);
        return (
          range.start !== null &&
          range.end !== null &&
          aktifJamKe >= range.start &&
          aktifJamKe <= range.end
        );
      });

      const guruName = String(activeSlot?.guru || '').trim();

      // Empty slot / unassigned teacher -> 'Merah'
      if (!activeSlot || !guruName || guruName === '-') {
        return {
          kelas,
          tingkat,
          status: 'Tidak Ada Guru',
          colorLabel: 'Merah',
          guru: '-',
          mapel: 'Jam kosong / Belum ada jadwal guru',
          jamKe: `Jam ke-${aktifJamKe} (${currentSession.mulai} - ${currentSession.selesai})`,
          ruang: '-',
          guruCheckedIn: false,
          jurnalFilled: false,
        };
      }

      const mapelName = String(activeSlot.mapel || '-').trim();
      const range = parseJamKeRangeFromJadwal(activeSlot.jam);
      const jamKeDisplay = `${range.label} (${range.startTime || currentSession.mulai}-${range.endTime || currentSession.selesai})`;
      const startMin = timeToMinutes(range.startTime || currentSession.mulai);
      const elapsedSinceStart = nowMin - startMin;

      const guruCheckedIn = hadirPegawaiToday.some(
        (p) =>
          p.status === 'Hadir' &&
          p.nama.trim().toLowerCase() === guruName.toLowerCase()
      );
      const jurnalFilled = jurnalToday.some((jr) => {
        if (
          jr.kelas !== kelas ||
          jr.mapel.trim().toLowerCase() !== mapelName.toLowerCase() ||
          jr.guruNama.trim().toLowerCase() !== guruName.toLowerCase()
        ) {
          return false;
        }
        const jrRange = parseJamKeRangeFromJadwal(jr.jamKe);
        if (jrRange.start !== null && jrRange.end !== null) {
          return aktifJamKe >= jrRange.start && aktifJamKe <= jrRange.end;
        }
        return true;
      });

      // Active KBM ('Hijau') when journal is filled or teacher checked in
      if (jurnalFilled || guruCheckedIn) {
        return {
          kelas,
          tingkat,
          status: jurnalFilled ? 'Sedang KBM' : 'Hadir (Menunggu Jurnal)',
          colorLabel: 'Hijau',
          guru: guruName,
          mapel: mapelName,
          jamKe: jamKeDisplay,
          ruang: activeSlot.ruang || '-',
          guruCheckedIn,
          jurnalFilled,
        };
      }

      // First 5 minutes before teacher fills journal -> 'Kuning'
      if (elapsedSinceStart >= 0 && elapsedSinceStart < 5) {
        return {
          kelas,
          tingkat,
          status: '5 Menit Awal',
          colorLabel: 'Kuning',
          guru: guruName,
          mapel: mapelName,
          jamKe: jamKeDisplay,
          ruang: activeSlot.ruang || '-',
          guruCheckedIn: false,
          jurnalFilled: false,
        };
      }

      // Teacher absent / no journal past 5-minute window -> 'Merah'
      return {
        kelas,
        tingkat,
        status: 'Tidak Ada Guru',
        colorLabel: 'Merah',
        guru: '-',
        mapel: `${mapelName} (Belum isi jurnal: ${guruName})`,
        jamKe: jamKeDisplay,
        ruang: activeSlot.ruang || '-',
        guruCheckedIn: false,
        jurnalFilled: false,
      };
    }

    // 4. Outside active KBM hours (07:00 - 15:15 WIB) -> Idle ('Abu')
    return {
      kelas,
      tingkat,
      status: 'OFF',
      colorLabel: 'Abu',
      guru: '-',
      mapel:
        jadwalKelas.length > 0
          ? `Di luar jam KBM (${jadwalKelas.length} jadwal hari ini)`
          : 'Di luar jam KBM (07:00 - 15:15)',
      jamKe: '-',
      ruang: '-',
      guruCheckedIn: false,
      jurnalFilled: false,
    };
  });

  return { sessionLabel, rombels };
}

export const LiveTeacherDashboard: React.FC<LiveTeacherDashboardProps> = ({ liveTick }) => {
  const [data, setData] = useState<LiveRombelPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterTingkat, setFilterTingkat] = useState<'' | TingkatGroup>('');
  const [filterKelas, setFilterKelas] = useState('');
  const [filterColor, setFilterColor] = useState<'' | RombelColorLabel>('');
  const [liveClock, setLiveClock] = useState(() => `${getTimeWIB()} WIB`);
  const [nowHHMM, setNowHHMM] = useState(() => getTimeWIB().substring(0, 5));

  const fetchLiveStatus = useCallback(async (isManual = false) => {
    if (!getAuthToken()) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isManual) setRefreshing(true);
    try {
      const res = await apiRequest<{ status: boolean; data: LiveRombelPayload }>('/api/live-rombel');
      if (res.status && res.data) {
        setData(res.data);
        setLoadError(null);
        if (res.data.timeStr) {
          setNowHHMM(res.data.timeStr.substring(0, 5));
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return;
      }
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat status rombel.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveStatus();
  }, [fetchLiveStatus, liveTick]);

  // Real-time WIB clock (1s) and 30-second auto-refresh for active KBM status changes
  useEffect(() => {
    const updateClock = () => {
      const timeWib = getTimeWIB();
      setLiveClock(`${timeWib} WIB`);
      setNowHHMM(timeWib.substring(0, 5));
    };
    updateClock();
    const secTimer = window.setInterval(updateClock, 1000);
    const syncTimer = window.setInterval(() => {
      fetchLiveStatus();
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(secTimer);
      window.clearInterval(syncTimer);
    };
  }, [fetchLiveStatus]);

  const computed = useMemo(() => {
    if (!data) {
      return { sessionLabel: '-', rombels: [] as RombelStatusCard[] };
    }
    return calculateClassStatusColors(data, nowHHMM);
  }, [data, nowHHMM]);

  const rombels = computed.rombels;
  const countHijau = rombels.filter((r) => r.colorLabel === 'Hijau').length;
  const countKuning = rombels.filter((r) => r.colorLabel === 'Kuning').length;
  const countMerah = rombels.filter((r) => r.colorLabel === 'Merah').length;
  const countAbu = rombels.filter((r) => r.colorLabel === 'Abu').length;

  const filteredRombels = useMemo(() => {
    return rombels.filter((r) => {
      if (filterTingkat && r.tingkat !== filterTingkat) return false;
      if (filterKelas && r.kelas !== filterKelas) return false;
      if (filterColor && r.colorLabel !== filterColor) return false;
      return true;
    });
  }, [rombels, filterTingkat, filterKelas, filterColor]);

  const groupedRombels = useMemo(() => {
    return TINGKAT_ORDER.map((tingkat) => ({
      tingkat,
      items: filteredRombels.filter((r) => r.tingkat === tingkat),
    })).filter((g) => g.items.length > 0);
  }, [filteredRombels]);

  const getCardStyle = (colorLabel: RombelColorLabel) => {
    switch (colorLabel) {
      case 'Hijau':
        return {
          card: 'bg-emerald-50/90 dark:bg-emerald-950/35 border-emerald-300 dark:border-emerald-700/70',
          badge: 'bg-emerald-600 text-white',
          icon: <CheckCircle2 className="w-3 h-3 shrink-0" />,
        };
      case 'Kuning':
        return {
          card: 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-300 dark:border-amber-700/70',
          badge: 'bg-amber-500 text-slate-950',
          icon: <AlertTriangle className="w-3 h-3 shrink-0" />,
        };
      case 'Merah':
        return {
          card: 'bg-rose-50/90 dark:bg-rose-950/35 border-rose-300 dark:border-rose-700/70',
          badge: 'bg-rose-600 text-white',
          icon: <UserX className="w-3 h-3 shrink-0" />,
        };
      default:
        return {
          card: 'bg-slate-100/90 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700',
          badge: 'bg-slate-500 text-white',
          icon: <Coffee className="w-3 h-3 shrink-0" />,
        };
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header Hari, Tanggal, & Jam Sekarang (TODAY) - Compact on Mobile */}
      <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
            <Radio className="w-3.5 h-3.5 animate-pulse shrink-0" />
            <span>Pemantauan Real-Time KBM · {computed.sessionLabel}</span>
          </div>
          <h2 className="text-base sm:text-xl font-extrabold">Dashboard Kehadiran Guru &amp; Status Rombel</h2>
          <p className="text-[11px] sm:text-xs text-slate-300">
            {data ? `${formatHariTanggal(data.todayStr)} · Jadwal Hari ${data.todayHari}` : 'Memuat tanggal...'}
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5">
          <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/15 backdrop-blur">
            <span className="block text-[10px] text-slate-300">Jam Sekarang</span>
            <span className="font-mono text-sm sm:text-base font-extrabold text-emerald-300 tabular-nums">
              {liveClock}
            </span>
          </div>
          <button
            type="button"
            onClick={() => fetchLiveStatus(true)}
            disabled={refreshing}
            className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow transition whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Ringkasan Warna Status Rombel - Compact 2x2 on Mobile */}
      {loadError && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => fetchLiveStatus(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold"
          >
            Coba Lagi
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setFilterColor(filterColor === 'Hijau' ? '' : 'Hijau')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition ${
            filterColor === 'Hijau'
              ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="truncate">Sedang KBM (Hijau)</span>
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
            {countHijau}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterColor(filterColor === 'Kuning' ? '' : 'Kuning')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition ${
            filterColor === 'Kuning'
              ? 'ring-2 ring-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold text-amber-700 dark:text-amber-400">
            <span className="truncate">5 Menit Awal (Kuning)</span>
            <Clock className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
            {countKuning}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterColor(filterColor === 'Merah' ? '' : 'Merah')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition ${
            filterColor === 'Merah'
              ? 'ring-2 ring-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold text-rose-700 dark:text-rose-400">
            <span className="truncate">Kosong / - (Merah)</span>
            <UserX className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5 tabular-nums">
            {countMerah}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterColor(filterColor === 'Abu' ? '' : 'Abu')}
          className={`p-3 sm:p-4 rounded-xl border text-left transition ${
            filterColor === 'Abu'
              ? 'ring-2 ring-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400">
            <span className="truncate">Istirahat / OFF (Abu)</span>
            <Coffee className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-600 dark:text-slate-300 mt-0.5 tabular-nums">
            {countAbu}
          </div>
        </button>
      </div>

      {/* Filter Bar + Group Tingkat Kelas (Kelas X, XI, XII) */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['', 'Kelas X', 'Kelas XI', 'Kelas XII'] as const).map((grp) => {
            const active = filterTingkat === grp;
            return (
              <button
                key={grp || 'all'}
                type="button"
                onClick={() => {
                  setFilterTingkat(grp);
                  setFilterKelas('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {grp || 'Semua Tingkat'}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Filter Kelas / Rombel
            </label>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="">Semua Kelas / Rombel</option>
              {rombels
                .filter((r) => !filterTingkat || r.tingkat === filterTingkat)
                .map((r) => (
                  <option key={r.kelas} value={r.kelas}>
                    {r.kelas}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Filter Status Warna KBM
            </label>
            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value as '' | RombelColorLabel)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="">Semua Status</option>
              <option value="Hijau">Sedang KBM (Hijau)</option>
              <option value="Kuning">5 Menit Awal Sebelum Isi Jurnal (Kuning)</option>
              <option value="Merah">Tidak Ada Guru / - (Merah)</option>
              <option value="Abu">Istirahat / OFF (Abu)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grouped Rombel Sections: Kelas X, Kelas XI, Kelas XII */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse"
            />
          ))}
        </div>
      ) : groupedRombels.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
          Tidak ada rombel kelas yang sesuai dengan filter saat ini.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedRombels.map((group) => {
            const activeCount = group.items.filter((x) => x.colorLabel === 'Hijau').length;
            return (
              <section key={group.tingkat} className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {group.tingkat}
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                    {activeCount}/{group.items.length} KBM Aktif
                  </span>
                </div>

                {/* Compact Mobile-Friendly Grid (2 cols on mobile HP, up to 5 on wide desktop) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
                  {group.items.map((card) => {
                    const style = getCardStyle(card.colorLabel);
                    return (
                      <div
                        key={card.kelas}
                        className={`p-3 sm:p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${style.card}`}
                      >
                        <div className="flex items-start justify-between gap-1.5 border-b border-black/10 dark:border-white/10 pb-2">
                          <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                            {card.kelas}
                          </h4>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap shrink-0 ${style.badge}`}
                          >
                            {style.icon}
                            <span>{card.colorLabel}</span>
                          </span>
                        </div>

                        <div className="space-y-1 text-[11px] leading-tight min-w-0">
                          <div className="font-bold text-slate-800 dark:text-slate-100 truncate" title={card.status}>
                            {card.status}
                          </div>
                          <div className="text-slate-700 dark:text-slate-200 font-semibold truncate" title={card.guru}>
                            Guru: {card.guru}
                          </div>
                          <div
                            className="text-indigo-700 dark:text-indigo-300 font-medium truncate"
                            title={card.mapel}
                          >
                            {card.mapel}
                          </div>
                          <div
                            className="font-mono text-[10px] text-slate-600 dark:text-slate-300 tabular-nums truncate pt-0.5"
                            title={card.jamKe}
                          >
                            {card.jamKe}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
