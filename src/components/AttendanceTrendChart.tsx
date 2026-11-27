import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Filter,
  GraduationCap,
  Layers,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Table as TableIcon,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KehadiranPegawaiRecord, KehadiranSiswaRecord } from '../shared/types';
import { formatHariTanggal } from '../shared/scheduleConstants';

export type TimeframeMode = '7d' | '14d' | '30d' | '6m';
export type CategoryFilter = 'all' | 'siswa' | 'pegawai';
export type ChartStyle = 'area' | 'bar' | 'line';

interface AttendanceTrendChartProps {
  kehadiranSiswa: KehadiranSiswaRecord[];
  kehadiranPegawai: KehadiranPegawaiRecord[];
  totalSiswa?: number;
  totalPegawai?: number;
  title?: string;
  subtitle?: string;
}

interface TrendPoint {
  date: string;
  label: string;
  fullDate: string;
  dayName: string;
  siswaHadir: number;
  siswaTerlambat: number;
  siswaSakit: number;
  siswaIzin: number;
  siswaAlpa: number;
  siswaTotal: number;
  pegawaiHadir: number;
  pegawaiSakitIzin: number;
  pegawaiTotal: number;
  totalHadir: number;
  siswaRate: number; // percentage
  pegawaiRate: number; // percentage
}

export const AttendanceTrendChart: React.FC<AttendanceTrendChartProps> = ({
  kehadiranSiswa,
  kehadiranPegawai,
  totalSiswa = 528,
  totalPegawai = 4,
  title = 'Tren Kehadiran Siswa & Pegawai',
  subtitle = 'Visualisasi interaktif Recharts tren presensi harian, mingguan, dan bulanan',
}) => {
  const [timeframe, setTimeframe] = useState<TimeframeMode>('7d');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('area');
  const [showTable, setShowTable] = useState(false);

  // Helper date parsing (YYYY-MM-DD to Date in local WIB)
  const parseDateStr = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return new Date();
  };

  const chartData = useMemo<TrendPoint[]>(() => {
    const today = new Date();
    const result: TrendPoint[] = [];

    if (timeframe === '6m') {
      // 6-month aggregate view
      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const monthPrefix = `${yyyy}-${mm}`;
        const label = d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

        const sList = kehadiranSiswa.filter((h) => h.tglAbsen.startsWith(monthPrefix));
        const pList = kehadiranPegawai.filter((h) => h.tglAbsen.startsWith(monthPrefix));

        const siswaHadir = sList.filter((h) => h.status === 'Hadir' || h.status === 'Terlambat').length;
        const siswaTerlambat = sList.filter((h) => h.status === 'Terlambat').length;
        const siswaSakit = sList.filter((h) => h.status === 'Sakit').length;
        const siswaIzin = sList.filter((h) => h.status === 'Izin').length;
        const siswaAlpa = sList.filter((h) => h.status === 'Alpa').length;

        const pegawaiHadir = pList.filter((h) => h.status === 'Hadir' || h.status === 'Terlambat').length;
        const pegawaiSakitIzin = pList.filter((h) => h.status === 'Sakit' || h.status === 'Izin').length;

        // Distinct school days in this month that had attendance
        const distinctDays = new Set([
          ...sList.map((h) => h.tglAbsen),
          ...pList.map((h) => h.tglAbsen),
        ]).size || 1;

        const avgSiswaHadir = Math.round(siswaHadir / distinctDays);
        const avgPegawaiHadir = Math.round(pegawaiHadir / distinctDays);

        const siswaRate = totalSiswa > 0 ? Math.min(100, Math.round((avgSiswaHadir / totalSiswa) * 100)) : 0;
        const pegawaiRate = totalPegawai > 0 ? Math.min(100, Math.round((avgPegawaiHadir / totalPegawai) * 100)) : 0;

        result.push({
          date: monthPrefix,
          label,
          fullDate: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
          dayName: `${distinctDays} Hari KBM`,
          siswaHadir: avgSiswaHadir,
          siswaTerlambat: Math.round(siswaTerlambat / distinctDays),
          siswaSakit: Math.round(siswaSakit / distinctDays),
          siswaIzin: Math.round(siswaIzin / distinctDays),
          siswaAlpa: Math.round(siswaAlpa / distinctDays),
          siswaTotal: sList.length,
          pegawaiHadir: avgPegawaiHadir,
          pegawaiSakitIzin: Math.round(pegawaiSakitIzin / distinctDays),
          pegawaiTotal: pList.length,
          totalHadir: avgSiswaHadir + avgPegawaiHadir,
          siswaRate,
          pegawaiRate,
        });
      }
      return result;
    }

    // Daily views: 7 days, 14 days, or 30 days
    const daysCount = timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : 30;

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const shortLabel = d.toLocaleDateString('id-ID', {
        weekday: daysCount <= 7 ? 'short' : undefined,
        day: 'numeric',
        month: daysCount > 14 ? 'numeric' : 'short',
      });
      const dayName = d.toLocaleDateString('id-ID', { weekday: 'long' });
      const fullDate = d.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const sRecords = kehadiranSiswa.filter((h) => h.tglAbsen === dateStr);
      const pRecords = kehadiranPegawai.filter((h) => h.tglAbsen === dateStr);

      const siswaHadir = sRecords.filter((h) => h.status === 'Hadir' || h.status === 'Terlambat').length;
      const siswaTerlambat = sRecords.filter((h) => h.status === 'Terlambat').length;
      const siswaSakit = sRecords.filter((h) => h.status === 'Sakit').length;
      const siswaIzin = sRecords.filter((h) => h.status === 'Izin').length;
      const siswaAlpa = sRecords.filter((h) => h.status === 'Alpa').length;

      const pegawaiHadir = pRecords.filter((h) => h.status === 'Hadir' || h.status === 'Terlambat').length;
      const pegawaiSakitIzin = pRecords.filter((h) => h.status === 'Sakit' || h.status === 'Izin').length;

      const siswaRate = totalSiswa > 0 ? Math.min(100, Math.round((siswaHadir / totalSiswa) * 100)) : 0;
      const pegawaiRate = totalPegawai > 0 ? Math.min(100, Math.round((pegawaiHadir / totalPegawai) * 100)) : 0;

      result.push({
        date: dateStr,
        label: shortLabel,
        fullDate,
        dayName,
        siswaHadir,
        siswaTerlambat,
        siswaSakit,
        siswaIzin,
        siswaAlpa,
        siswaTotal: sRecords.length,
        pegawaiHadir,
        pegawaiSakitIzin,
        pegawaiTotal: pRecords.length,
        totalHadir: siswaHadir + pegawaiHadir,
        siswaRate,
        pegawaiRate,
      });
    }

    return result;
  }, [timeframe, kehadiranSiswa, kehadiranPegawai, totalSiswa, totalPegawai]);

  // Aggregate KPI summary for the selected period
  const stats = useMemo(() => {
    // Only calculate from points that had any attendance or active school days
    const activePoints = chartData.filter((p) => p.siswaHadir > 0 || p.pegawaiHadir > 0);
    const count = activePoints.length || 1;

    const totalSiswaHadir = activePoints.reduce((acc, p) => acc + p.siswaHadir, 0);
    const totalPegawaiHadir = activePoints.reduce((acc, p) => acc + p.pegawaiHadir, 0);
    const avgSiswaHadir = Math.round(totalSiswaHadir / count);
    const avgPegawaiHadir = Math.round(totalPegawaiHadir / count);

    const avgSiswaPct = totalSiswa > 0 ? Math.min(100, Math.round((avgSiswaHadir / totalSiswa) * 100)) : 0;
    const avgPegawaiPct = totalPegawai > 0 ? Math.min(100, Math.round((avgPegawaiHadir / totalPegawai) * 100)) : 0;

    // Peak day
    let peak = chartData[0];
    for (const p of chartData) {
      if (p.totalHadir > (peak?.totalHadir || 0)) {
        peak = p;
      }
    }

    // Overall check-in rate (Hadir / total submissions)
    const totalAllSubmissions = chartData.reduce((acc, p) => acc + p.siswaTotal + p.pegawaiTotal, 0);
    const totalAllHadir = chartData.reduce((acc, p) => acc + p.siswaHadir + p.pegawaiHadir, 0);
    const overallRate = totalAllSubmissions > 0 ? Math.round((totalAllHadir / totalAllSubmissions) * 100) : 100;

    return {
      activeDays: count,
      avgSiswaHadir,
      avgSiswaPct,
      avgPegawaiHadir,
      avgPegawaiPct,
      peakDay: peak || null,
      totalAllSubmissions,
      totalAllHadir,
      overallRate,
    };
  }, [chartData, totalSiswa, totalPegawai]);

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'Tanggal',
      'Hari',
      'Siswa Hadir',
      'Siswa Terlambat',
      'Siswa Ijin',
      'Siswa Sakit',
      'Siswa Alpha',
      'Pegawai Hadir',
      'Total Hadir',
      'Persen Siswa',
      'Persen Pegawai',
    ];
    const rows = chartData.map((d) => [
      d.date,
      d.dayName,
      d.siswaHadir,
      d.siswaTerlambat,
      d.siswaIzin,
      d.siswaSakit,
      d.siswaAlpa,
      d.pegawaiHadir,
      d.totalHadir,
      `${d.siswaRate}%`,
      `${d.pegawaiRate}%`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_tren_kehadiran_${timeframe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Custom Tooltip component
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color?: string; dataKey?: string }>; label?: string }) => {
    if (!active || !payload || !payload.length) return null;
    const point = chartData.find((p) => p.label === label || p.date === label);
    if (!point) return null;

    return (
      <div className="p-3.5 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur border border-slate-700/80 shadow-xl text-white text-xs space-y-2 min-w-[210px]">
        <div className="border-b border-slate-800 pb-1.5">
          <div className="font-bold text-slate-100 flex items-center justify-between gap-2">
            <span>{point.dayName}</span>
            <span className="font-mono text-[11px] text-slate-400">{point.date}</span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">{point.fullDate}</div>
        </div>

        <div className="space-y-1.5 pt-0.5">
          {(category === 'all' || category === 'siswa') && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 shrink-0" />
                <span className="text-slate-300">Siswa Hadir:</span>
              </div>
              <div className="font-mono font-bold text-indigo-300">
                {point.siswaHadir.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] text-slate-400 font-normal">({point.siswaRate}%)</span>
              </div>
            </div>
          )}

          {(category === 'all' || category === 'pegawai') && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
                <span className="text-slate-300">Pegawai/Guru:</span>
              </div>
              <div className="font-mono font-bold text-emerald-300">
                {point.pegawaiHadir.toLocaleString('id-ID')}{' '}
                <span className="text-[10px] text-slate-400 font-normal">({point.pegawaiRate}%)</span>
              </div>
            </div>
          )}

          {category === 'all' && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-800 font-bold">
              <span className="text-slate-300">Total Check-In:</span>
              <span className="font-mono text-white">{point.totalHadir.toLocaleString('id-ID')} orang</span>
            </div>
          )}

          {(point.siswaTerlambat > 0 || point.siswaSakit > 0 || point.siswaIzin > 0 || point.siswaAlpa > 0) && (
            <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between gap-2">
              <span>Detail Status:</span>
              <span className="text-right">
                {point.siswaTerlambat > 0 ? `Terlambat: ${point.siswaTerlambat} ` : ''}
                {point.siswaIzin > 0 ? `Ijin: ${point.siswaIzin} ` : ''}
                {point.siswaSakit > 0 ? `Sakit: ${point.siswaSakit} ` : ''}
                {point.siswaAlpa > 0 ? `Alpha: ${point.siswaAlpa}` : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
      {/* Header and Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold uppercase tracking-wider">
                Recharts Analytics
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Switcher (Mingguan vs Bulanan) */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setTimeframe('7d')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                timeframe === '7d'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Mingguan (7 Hari)
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('14d')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                timeframe === '14d'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              14 Hari
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('30d')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                timeframe === '30d'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Bulanan (30 Hari)
            </button>
            <button
              type="button"
              onClick={() => setTimeframe('6m')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                timeframe === '6m'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              6 Bulan
            </button>
          </div>

          {/* Category Filter */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition ${
                category === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setCategory('siswa')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition ${
                category === 'siswa'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Siswa
            </button>
            <button
              type="button"
              onClick={() => setCategory('pegawai')}
              className={`px-2.5 py-1.5 rounded-lg font-semibold transition ${
                category === 'pegawai'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Pegawai
            </button>
          </div>

          {/* Chart Style Switcher */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              title="Grafik Area Halus"
              onClick={() => setChartStyle('area')}
              className={`p-1.5 rounded-lg transition ${
                chartStyle === 'area'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <PieChartIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Grafik Batang"
              onClick={() => setChartStyle('bar')}
              className={`p-1.5 rounded-lg transition ${
                chartStyle === 'bar'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Grafik Garis Tren"
              onClick={() => setChartStyle('line')}
              className={`p-1.5 rounded-lg transition ${
                chartStyle === 'line'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LineChartIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Toggle Table View & Download */}
          <button
            type="button"
            onClick={() => setShowTable((prev) => !prev)}
            className={`p-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition ${
              showTable
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showTable ? 'Tutup Tabel' : 'Lihat Rekap'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            title="Download CSV Rekap Tren"
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Rata-rata Siswa */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Rata-rata Hadir Siswa
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {stats.avgSiswaHadir.toLocaleString('id-ID')}
              </span>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                ({stats.avgSiswaPct}%)
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Target sekolah: 95%</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Rata-rata Pegawai */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Rata-rata Pegawai
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {stats.avgPegawaiHadir.toLocaleString('id-ID')}
              </span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                ({stats.avgPegawaiPct}%)
              </span>
            </div>
            <span className="text-[10px] text-slate-400">Disiplin KBM aktif</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Puncak Kehadiran */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Puncak Kehadiran
            </span>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums truncate">
              {stats.peakDay ? `${stats.peakDay.totalHadir} Check-In` : '-'}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block">
              {stats.peakDay ? stats.peakDay.dayName + ', ' + stats.peakDay.label : '-'}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Tingkat Kehadiran Periode */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Tingkat Hadir Valid
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {stats.overallRate}%
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">GPS / KBM</span>
            </div>
            <span className="text-[10px] text-slate-400">
              Total {stats.totalAllHadir.toLocaleString('id-ID')} kehadiran
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Recharts Graphic Viewport */}
      <div className="w-full pt-2">
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartStyle === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 15, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="siswaAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="pegawaiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1', opacity: 0.5 }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                  iconType="circle"
                />

                {(category === 'all' || category === 'siswa') && (
                  <Area
                    type="monotone"
                    dataKey="siswaHadir"
                    name="Siswa Hadir"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#siswaAreaGrad)"
                    dot={{ r: 3, fill: '#4f46e5' }}
                    activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                  />
                )}

                {(category === 'all' || category === 'pegawai') && (
                  <Area
                    type="monotone"
                    dataKey="pegawaiHadir"
                    name="Pegawai / Guru Hadir"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#pegawaiAreaGrad)"
                    dot={{ r: 3, fill: '#10b981' }}
                    activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                  />
                )}
              </AreaChart>
            ) : chartStyle === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 15, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1', opacity: 0.5 }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                  iconType="circle"
                />

                {(category === 'all' || category === 'siswa') && (
                  <Bar
                    dataKey="siswaHadir"
                    name="Siswa Hadir"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                )}

                {(category === 'all' || category === 'pegawai') && (
                  <Bar
                    dataKey="pegawaiHadir"
                    name="Pegawai / Guru Hadir"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                )}
              </BarChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 15, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1', opacity: 0.5 }}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                  iconType="circle"
                />

                {(category === 'all' || category === 'siswa') && (
                  <Line
                    type="monotone"
                    dataKey="siswaHadir"
                    name="Siswa Hadir"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ r: 3.5, fill: '#4f46e5' }}
                    activeDot={{ r: 6 }}
                  />
                )}

                {(category === 'all' || category === 'pegawai') && (
                  <Line
                    type="monotone"
                    dataKey="pegawaiHadir"
                    name="Pegawai / Guru Hadir"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ r: 3.5, fill: '#10b981' }}
                    activeDot={{ r: 6 }}
                  />
                )}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Optional Table Breakdown Drawer */}
      {showTable && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Tabel Rincian Data Harian ({timeframe === '7d' ? 'Mingguan' : timeframe === '30d' ? 'Bulanan' : timeframe})
            </h4>
            <span className="text-xs text-slate-500 font-mono">{chartData.length} baris data</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Hari</th>
                  <th className="py-2.5 px-3 text-right">Siswa Hadir</th>
                  <th className="py-2.5 px-3 text-right">Persen Siswa</th>
                  <th className="py-2.5 px-3 text-right">Pegawai Hadir</th>
                  <th className="py-2.5 px-3 text-right">Total Check-In</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300">
                {chartData.map((row) => (
                  <tr key={row.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-3 font-mono text-[11px]">{row.date}</td>
                    <td className="py-2 px-3 font-medium">{row.dayName}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {row.siswaHadir.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-500">
                      {row.siswaRate}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {row.pegawaiHadir.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {row.totalHadir.toLocaleString('id-ID')}
                    </td>
                    <td className="py-2 px-3">
                      {row.totalHadir > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          KBM Terlaksana
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Libur / Nihil</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
