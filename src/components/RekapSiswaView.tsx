import React, { useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { downloadRekapAbsensiSiswaPdf } from '../utils/pdfExport';
import { formatHariTanggal, getTodayWIB } from '../shared/scheduleConstants';
import type {
  AuthUser,
  KehadiranSiswaRecord,
  PengaturanSekolah,
  SiswaRecord,
} from '../shared/types';
import { AttendanceStatusBadge } from './AttendanceStatusButtons';

interface RekapSiswaViewProps {
  user: AuthUser;
  todayStr?: string;
  pengaturan: PengaturanSekolah;
  siswa: SiswaRecord[];
  kehadiran: KehadiranSiswaRecord[];
}

export const RekapSiswaView: React.FC<RekapSiswaViewProps> = ({
  user,
  todayStr: todayStrProp,
  pengaturan,
  siswa,
  kehadiran,
}) => {
  const [filterKelas, setFilterKelas] = useState('');
  const [subTab, setSubTab] = useState<'per-kelas' | 'akumulasi' | 'log-harian'>(
    user.role === 'siswa' ? 'akumulasi' : 'per-kelas'
  );

  const todayStr = todayStrProp || getTodayWIB();

  const kelasList = useMemo(() => {
    const s = new Set(siswa.map((x) => x.kelas).filter(Boolean));
    return Array.from(s).sort();
  }, [siswa]);

  const filteredKelasList = filterKelas ? kelasList.filter((k) => k === filterKelas) : kelasList;

  const targetSiswaList = useMemo(() => {
    if (user.role === 'siswa') {
      return [
        {
          id: user.id,
          nis: user.nisNip,
          nama: user.nama,
          kelas: user.kelas,
          jurusan: user.jurusan || '-',
          jk: user.jk,
          tempatPkl: user.tempatPkl || '-',
          nilaiSm1: user.nilaiSm1 || '-',
          nilaiSm2: user.nilaiSm2 || '-',
          statusSm1: user.statusSm1 || '-',
          statusSm2: user.statusSm2 || '-',
          tugasBelumSm1: user.tugasBelumSm1 || '-',
          tugasBelumSm2: user.tugasBelumSm2 || '-',
        },
      ];
    }
    return filterKelas ? siswa.filter((s) => s.kelas === filterKelas) : siswa;
  }, [user, siswa, filterKelas]);

  const filteredLog = useMemo(() => {
    return filterKelas ? kehadiran.filter((h) => h.kelas === filterKelas) : kehadiran;
  }, [kehadiran, filterKelas]);

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Rekapitulasi Presensi Siswa
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Filter berdasarkan kelas dan unduh laporan resmi PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.role !== 'siswa' && (
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="">Semua Kelas</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => downloadRekapAbsensiSiswaPdf(pengaturan, targetSiswaList, kehadiran, filterKelas)}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm transition"
          >
            <FileDown className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        {user.role !== 'siswa' && (
          <button
            type="button"
            onClick={() => setSubTab('per-kelas')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              subTab === 'per-kelas'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Per Kelas Hari Ini
          </button>
        )}
        <button
          type="button"
          onClick={() => setSubTab('akumulasi')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            subTab === 'akumulasi'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Akumulasi (%)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('log-harian')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
            subTab === 'log-harian'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Log Harian
        </button>
      </div>

      {subTab === 'per-kelas' && user.role !== 'siswa' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredKelasList.map((k) => {
            const total = siswa.filter((s) => s.kelas === k).length;
            const h = kehadiran.filter((x) => x.kelas === k && x.tglAbsen === todayStr && x.status === 'Hadir').length;
            const t = kehadiran.filter((x) => x.kelas === k && x.tglAbsen === todayStr && x.status === 'Terlambat').length;
            const i = kehadiran.filter((x) => x.kelas === k && x.tglAbsen === todayStr && x.status === 'Izin').length;
            const s = kehadiran.filter((x) => x.kelas === k && x.tglAbsen === todayStr && x.status === 'Sakit').length;
            const a = kehadiran.filter((x) => x.kelas === k && x.tglAbsen === todayStr && x.status === 'Alpa').length;
            return (
              <div
                key={k}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">{k}</h4>
                  <span className="text-xs text-slate-500 tabular-nums">Total: {total} Siswa</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] pt-1 tabular-nums">
                  <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold" title="Hadir">
                    H: {h}
                  </div>
                  <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold" title="Ijin">
                    I: {i}
                  </div>
                  <div className="p-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 font-bold" title="Sakit">
                    S: {s}
                  </div>
                  <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-bold" title="Alpha">
                    A: {a}
                  </div>
                  <div className="p-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-bold" title="Terlambat">
                    T: {t}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subTab === 'akumulasi' && (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">NIS</th>
                <th className="p-3">Nama Siswa</th>
                <th className="p-3">Kelas</th>
                <th className="p-3 text-center">H</th>
                <th className="p-3 text-center">I</th>
                <th className="p-3 text-center">S</th>
                <th className="p-3 text-center">A</th>
                <th className="p-3 text-center">T</th>
                <th className="p-3 text-center">Persentase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {targetSiswaList.map((s) => {
                const logs = kehadiran.filter((x) => x.nis === s.nis);
                const h = logs.filter((x) => x.status === 'Hadir').length;
                const iz = logs.filter((x) => x.status === 'Izin').length;
                const sk = logs.filter((x) => x.status === 'Sakit').length;
                const al = logs.filter((x) => x.status === 'Alpa').length;
                const tr = logs.filter((x) => x.status === 'Terlambat').length;
                const pct = logs.length ? Math.round(((h + tr) / logs.length) * 100) : 0;
                return (
                  <tr key={s.nis} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{s.nis}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{s.nama}</td>
                    <td className="p-3">{s.kelas}</td>
                    <td className="p-3 text-center font-bold text-emerald-600 tabular-nums">{h}</td>
                    <td className="p-3 text-center font-bold text-blue-600 tabular-nums">{iz}</td>
                    <td className="p-3 text-center font-bold text-yellow-600 tabular-nums">{sk}</td>
                    <td className="p-3 text-center font-bold text-red-600 tabular-nums">{al}</td>
                    <td className="p-3 text-center font-bold text-orange-600 tabular-nums">{tr}</td>
                    <td className="p-3 text-center font-extrabold tabular-nums">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'log-harian' && (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Tanggal</th>
                <th className="p-3">Jam</th>
                <th className="p-3">NIS</th>
                <th className="p-3">Nama Siswa</th>
                <th className="p-3">Kelas</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredLog.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-500">
                    Belum ada log presensi siswa.
                  </td>
                </tr>
              ) : (
                filteredLog.slice(0, 150).map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 whitespace-nowrap">{formatHariTanggal(h.tglAbsen)}</td>
                    <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {h.waktuInput}
                    </td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{h.nis}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{h.nama}</td>
                    <td className="p-3">{h.kelas}</td>
                    <td className="p-3">
                      <AttendanceStatusBadge status={h.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
