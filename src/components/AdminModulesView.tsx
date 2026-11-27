import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Database,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../utils/api';
import { DatabaseDebugPanel } from './DatabaseDebugPanel';
import {
  formatHariTanggal,
  getTodayWIB,
  JAM_KBM_MATRIX,
  parseJamKeRangeFromJadwal,
} from '../shared/scheduleConstants';
import type {
  AttendanceStatus,
  AuthUser,
  HakAksesItem,
  JadwalRecord,
  JenjangSekolah,
  JurnalRecord,
  JurusanRecord,
  KalenderRecord,
  KehadiranPegawaiRecord,
  KehadiranSiswaRecord,
  PengaturanSekolah,
  SiswaRecord,
  UserAccountRecord,
  UserRole,
} from '../shared/types';
import {
  AttendanceStatusBadge,
  AttendanceStatusButtons,
  normalizeAttendanceStatus,
} from './AttendanceStatusButtons';

/* ============================================================================
 * 1. DATA KEHADIRAN GURU & KARYAWAN
 * ========================================================================== */
export const DataKehadiranPegawaiView: React.FC<{
  user: AuthUser;
  todayStr?: string;
  kehadiranPegawai: KehadiranPegawaiRecord[];
  users: UserAccountRecord[];
  onRefresh: () => Promise<void>;
}> = ({ user, todayStr, kehadiranPegawai, users, onRefresh }) => {
  const isAdmin = user.role === 'admin';
  const effectiveToday = todayStr || getTodayWIB();
  const prevTodayRef = useRef(effectiveToday);
  const [subTab, setSubTab] = useState<'log' | 'rekap' | 'kelola'>('log');
  const [filterTgl, setFilterTgl] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [search, setSearch] = useState('');
  const [tglKelola, setTglKelola] = useState(effectiveToday);
  const [manualOpen, setManualOpen] = useState(false);
  const [manUser, setManUser] = useState('');
  const [manTgl, setManTgl] = useState(effectiveToday);
  const [manStatus, setManStatus] = useState('Hadir');
  const [manKet, setManKet] = useState('');

  useEffect(() => {
    if (prevTodayRef.current !== effectiveToday) {
      prevTodayRef.current = effectiveToday;
      setTglKelola(effectiveToday);
      setManTgl(effectiveToday);
    }
  }, [effectiveToday]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kehadiranPegawai.filter((p) => {
      if (filterTgl && p.tglAbsen !== filterTgl) return false;
      if (filterRole && !p.roleJabatan.toUpperCase().includes(filterRole)) return false;
      if (q && !p.nama.toLowerCase().includes(q) && !p.nipUser.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [kehadiranPegawai, filterTgl, filterRole, search]);

  const masterPegawai = useMemo(() => {
    const map = new Map<string, { nipUser: string; nama: string; roleJabatan: string }>();
    if (isAdmin) {
      users.forEach((u) => {
        const key = (u.nisNip || u.username).toLowerCase();
        map.set(key, { nipUser: u.nisNip || u.username, nama: u.nama, roleJabatan: u.role.toUpperCase() });
      });
    } else {
      const key = (user.nisNip || user.username).toLowerCase();
      map.set(key, { nipUser: user.nisNip || user.username, nama: user.nama, roleJabatan: user.role.toUpperCase() });
    }
    kehadiranPegawai.forEach((p) => {
      const key = (p.nipUser || p.nama).toLowerCase();
      if (!map.has(key)) map.set(key, { nipUser: p.nipUser, nama: p.nama, roleJabatan: p.roleJabatan });
    });
    return Array.from(map.values());
  }, [isAdmin, users, user, kehadiranPegawai]);

  const exportCsv = () => {
    let csv = 'Tanggal,Waktu,NIP_Username,Nama_Lengkap,Jabatan,Status,Keterangan\n';
    filtered.forEach((r) => {
      csv += `"${r.tglAbsen}","${r.waktuInput}","${r.nipUser}","${r.nama}","${r.roleJabatan}","${r.status}","${r.jarakMeter}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Log_Kehadiran_Pegawai_${getTodayWIB()}.csv`;
    link.click();
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manUser) return;
    const peg = JSON.parse(manUser) as { nipUser: string; nama: string; roleJabatan: string };
    await apiRequest('/api/pegawai/presensi', {
      method: 'POST',
      body: JSON.stringify({
        tglAbsen: manTgl,
        nipUser: peg.nipUser,
        nama: peg.nama,
        roleJabatan: peg.roleJabatan,
        status: manStatus,
        jarakMeter: manKet || 'Input Manual Admin',
      }),
    });
    setManualOpen(false);
    await onRefresh();
  };

  const handleQuickUpdate = async (
    peg: { nipUser: string; nama: string; roleJabatan: string },
    status: string
  ) => {
    await apiRequest('/api/pegawai/presensi', {
      method: 'POST',
      body: JSON.stringify({
        tglAbsen: tglKelola,
        nipUser: peg.nipUser,
        nama: peg.nama,
        roleJabatan: peg.roleJabatan,
        status,
        jarakMeter: 'Diperbarui Admin',
      }),
    });
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Data Kehadiran Guru &amp; Karyawan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Log presensi harian, persentase keaktifan, dan pembaruan status pegawai.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Kehadiran</span>
            </button>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <input
          type="date"
          value={filterTgl}
          onChange={(e) => setFilterTgl(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
        />
        {isAdmin && (
          <>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white"
            >
              <option value="">Semua Jabatan</option>
              <option value="GURU">GURU</option>
              <option value="KARYAWAN">KARYAWAN</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau NIP..."
              className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </>
        )}
      </div>

      {/* SubTabs */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => setSubTab('log')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
            subTab === 'log' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Log Kehadiran
        </button>
        <button
          type="button"
          onClick={() => setSubTab('rekap')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
            subTab === 'rekap' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Rekap Akumulasi (%)
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setSubTab('kelola')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
              subTab === 'kelola' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Update Cepat Harian (Admin)
          </button>
        )}
      </div>

      {subTab === 'log' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Tanggal</th>
                <th className="p-3">Jam Masuk</th>
                <th className="p-3">NIP / ID</th>
                <th className="p-3">Nama Pegawai</th>
                <th className="p-3">Jabatan</th>
                <th className="p-3">Keterangan / Radius</th>
                <th className="p-3 text-center">Status</th>
                {isAdmin && <th className="p-3 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="p-8 text-center text-slate-500">
                    Belum ada log kehadiran pegawai.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 whitespace-nowrap">{formatHariTanggal(p.tglAbsen)}</td>
                    <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {p.waktuInput} WIB
                    </td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{p.nipUser}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{p.nama}</td>
                    <td className="p-3">{p.roleJabatan}</td>
                    <td className="p-3 text-slate-500">{p.jarakMeter}</td>
                    <td className="p-3 text-center">
                      <AttendanceStatusBadge status={p.status} />
                    </td>
                    {isAdmin && (
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/pegawai/presensi/${p.id}`, { method: 'DELETE' });
                            await onRefresh();
                          }}
                          className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'rekap' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">NIP / ID</th>
                <th className="p-3">Nama Lengkap</th>
                <th className="p-3">Jabatan</th>
                <th className="p-3 text-center">Hadir</th>
                <th className="p-3 text-center">Terlambat</th>
                <th className="p-3 text-center">Ijin</th>
                <th className="p-3 text-center">Sakit</th>
                <th className="p-3 text-center">Alpha</th>
                <th className="p-3 text-center">Persentase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {masterPegawai.map((u) => {
                const logs = filtered.filter(
                  (p) =>
                    p.nipUser.toLowerCase() === u.nipUser.toLowerCase() ||
                    p.nama.toLowerCase() === u.nama.toLowerCase()
                );
                const h = logs.filter((x) => x.status === 'Hadir').length;
                const t = logs.filter((x) => x.status === 'Terlambat').length;
                const i = logs.filter((x) => x.status === 'Izin').length;
                const s = logs.filter((x) => x.status === 'Sakit').length;
                const a = logs.filter((x) => x.status === 'Alpa').length;
                const tot = h + t + s + i + a;
                const pct = tot > 0 ? Math.round(((h + t) / tot) * 100) : 0;
                return (
                  <tr key={u.nipUser} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{u.nipUser}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{u.nama}</td>
                    <td className="p-3">{u.roleJabatan}</td>
                    <td className="p-3 text-center font-bold text-emerald-600 tabular-nums">{h}</td>
                    <td className="p-3 text-center font-bold text-orange-600 tabular-nums">{t}</td>
                    <td className="p-3 text-center font-bold text-blue-600 tabular-nums">{i}</td>
                    <td className="p-3 text-center font-bold text-yellow-600 tabular-nums">{s}</td>
                    <td className="p-3 text-center font-bold text-red-600 tabular-nums">{a}</td>
                    <td className="p-3 text-center font-extrabold tabular-nums">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'kelola' && isAdmin && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              Pilih Tanggal Update Harian:
            </span>
            <input
              type="date"
              value={tglKelola}
              onChange={(e) => setTglKelola(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
            />
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3">NIP</th>
                  <th className="p-3">Nama Pegawai</th>
                  <th className="p-3">Status Saat Ini</th>
                  <th className="p-3 text-center">Set Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {masterPegawai.map((u) => {
                  const rec = kehadiranPegawai.find(
                    (p) =>
                      p.tglAbsen === tglKelola &&
                      (p.nipUser.toLowerCase() === u.nipUser.toLowerCase() ||
                        p.nama.toLowerCase() === u.nama.toLowerCase())
                  );
                  return (
                    <tr key={u.nipUser}>
                      <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{u.nipUser}</td>
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">{u.nama}</td>
                      <td className="p-3">{rec ? `${rec.status} (${rec.waktuInput})` : 'Belum Presensi'}</td>
                      <td className="p-3 text-center">
                        <AttendanceStatusButtons
                          value={rec?.status || ''}
                          onChange={(nextStatus) => handleQuickUpdate(u, nextStatus)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {manualOpen && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Catat Kehadiran Pegawai</h3>
              <button type="button" onClick={() => setManualOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveManual} className="space-y-3 text-xs">
              <select
                required
                value={manUser}
                onChange={(e) => setManUser(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
              >
                <option value="">-- Pilih Pegawai --</option>
                {masterPegawai.map((u) => (
                  <option key={u.nipUser} value={JSON.stringify(u)}>
                    {u.nama} ({u.roleJabatan})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  required
                  value={manTgl}
                  onChange={(e) => setManTgl(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <select
                  value={manStatus}
                  onChange={(e) => setManStatus(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                >
                  <option value="Hadir">Hadir</option>
                  <option value="Izin">Ijin</option>
                  <option value="Sakit">Sakit</option>
                  <option value="Alpa">Alpha</option>
                  <option value="Terlambat">Terlambat</option>
                </select>
              </div>
              <input
                type="text"
                value={manKet}
                onChange={(e) => setManKet(e.target.value)}
                placeholder="Keterangan (opsional)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold"
              >
                Simpan Kehadiran
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 2. KALENDER SEKOLAH (SESUAI BULAN BERJALAN TAHUN AJARAN + IMPORT HARI EFEKTIF)
 * ========================================================================== */
const BULAN_ID = [
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

function parseTahunAjaranMonths(tahunAjaran: string): Array<{ ym: string; label: string }> {
  const match = String(tahunAjaran || '2026/2027').match(/(\d{4})\D+(\d{4})/);
  const startYear = match ? Number(match[1]) : 2026;
  const endYear = match ? Number(match[2]) : startYear + 1;
  const months: Array<{ ym: string; label: string }> = [];
  // Juli - Desember tahun awal
  for (let m = 7; m <= 12; m++) {
    months.push({
      ym: `${startYear}-${String(m).padStart(2, '0')}`,
      label: `${BULAN_ID[m - 1]} ${startYear}`,
    });
  }
  // Januari - Juni tahun akhir
  for (let m = 1; m <= 6; m++) {
    months.push({
      ym: `${endYear}-${String(m).padStart(2, '0')}`,
      label: `${BULAN_ID[m - 1]} ${endYear}`,
    });
  }
  return months;
}

function isKegiatanSekolahRecord(rec?: KalenderRecord): boolean {
  if (!rec || rec.statusEfektif !== 'Tidak Efektif') return false;
  const ket = (rec.keterangan || '').toLowerCase();
  if (ket.includes('libur nasional') || ket.includes('cuti bersama') || ket.includes('minggu') || ket.includes('sabtu')) {
    return false;
  }
  if (
    rec.modeKbm !== 'Libur' ||
    ket.includes('kegiatan') ||
    ket.includes('rapat') ||
    ket.includes('mpls') ||
    ket.includes('classmeeting') ||
    ket.includes('rapor') ||
    ket.includes('ujian') ||
    ket.includes('anbk') ||
    ket.includes('lomba') ||
    ket.includes('upacara') ||
    ket.includes('acara') ||
    ket.includes('pesantren')
  ) {
    return true;
  }
  return false;
}

export const KalenderPendidikanView: React.FC<{
  user: AuthUser;
  pengaturan?: PengaturanSekolah;
  kalender: KalenderRecord[];
  onRefresh: () => Promise<void>;
}> = ({ user, pengaturan, kalender, onRefresh }) => {
  const canManage = user.role === 'admin' || user.role === 'guru';
  const todayStr = getTodayWIB();
  const tahunAjaran = pengaturan?.tahunAjaran || '2026/2027';

  const taMonths = useMemo(() => parseTahunAjaranMonths(tahunAjaran), [tahunAjaran]);
  const [selectedYm, setSelectedYm] = useState<string>(() => todayStr.slice(0, 7));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tanggal, setTanggal] = useState(todayStr);
  const [modeKbm, setModeKbm] = useState<'Luring' | 'Daring' | 'Libur'>('Luring');
  const [statusEfektif, setStatusEfektif] = useState<'Efektif' | 'Tidak Efektif'>('Efektif');
  const [jamMulai, setJamMulai] = useState('06:30');
  const [jamSelesai, setJamSelesai] = useState('16:00');
  const [keterangan, setKeterangan] = useState('');
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAllMonthsTable, setShowAllMonthsTable] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const kalenderMap = useMemo(() => {
    const m = new Map<string, KalenderRecord>();
    kalender.forEach((k) => {
      m.set(String(k.tanggal).slice(0, 10), k);
    });
    return m;
  }, [kalender]);

  const calendarCells = useMemo(() => {
    const [yStr, mStr] = selectedYm.split('-');
    const year = Number(yStr) || 2026;
    const monthIdx = (Number(mStr) || 1) - 1;
    const firstDay = new Date(year, monthIdx, 1);
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    // Monday-first grid: Mon=0 .. Sun=6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: Array<{
      dateStr: string | null;
      dayNum: number | null;
      dow: number;
      isWeekend: boolean;
      record?: KalenderRecord;
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ dateStr: null, dayNum: null, dow: -1, isWeekend: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(year, monthIdx, d).getDay();
      cells.push({
        dateStr,
        dayNum: d,
        dow,
        isWeekend: dow === 0 || dow === 6,
        record: kalenderMap.get(dateStr),
      });
    }
    return cells;
  }, [selectedYm, kalenderMap]);

  const monthSummary = useMemo(() => {
    let efektifLuring = 0;
    let efektifDaring = 0;
    let kegiatanSekolah = 0;
    let libur = 0;
    calendarCells.forEach((c) => {
      if (!c.dateStr) return;
      if (c.record) {
        if (isKegiatanSekolahRecord(c.record)) kegiatanSekolah++;
        else if (c.record.modeKbm === 'Libur' || c.record.statusEfektif === 'Tidak Efektif') libur++;
        else if (c.record.modeKbm === 'Daring') efektifDaring++;
        else efektifLuring++;
      } else if (c.isWeekend) {
        libur++;
      } else {
        efektifLuring++;
      }
    });
    return { efektifLuring, efektifDaring, kegiatanSekolah, libur };
  }, [calendarCells]);

  const applyPreset = (preset: 'efektif_luring' | 'efektif_daring' | 'kegiatan_sekolah' | 'libur_nasional') => {
    if (preset === 'efektif_luring') {
      setStatusEfektif('Efektif');
      setModeKbm('Luring');
      setJamMulai('06:30');
      setJamSelesai('16:00');
      setKeterangan('Hari Efektif KBM (Luring)');
    } else if (preset === 'efektif_daring') {
      setStatusEfektif('Efektif');
      setModeKbm('Daring');
      setJamMulai('07:00');
      setJamSelesai('14:00');
      setKeterangan('Hari Efektif KBM (Daring)');
    } else if (preset === 'kegiatan_sekolah') {
      setStatusEfektif('Tidak Efektif');
      setModeKbm('Luring');
      setJamMulai('07:00');
      setJamSelesai('12:00');
      setKeterangan('Kegiatan Sekolah (Tidak Efektif KBM)');
    } else {
      setStatusEfektif('Tidak Efektif');
      setModeKbm('Libur');
      setJamMulai('-');
      setJamSelesai('-');
      setKeterangan('Libur Nasional');
    }
  };

  const handleSelectCalendarDate = (dateStr: string, dow: number, rec?: KalenderRecord) => {
    setTanggal(dateStr);
    setFeedback(null);
    if (rec) {
      setEditingId(rec.id);
      setModeKbm(rec.modeKbm);
      setStatusEfektif(rec.statusEfektif);
      setJamMulai(rec.jamMulai || '-');
      setJamSelesai(rec.jamSelesai || '-');
      setKeterangan(rec.keterangan || '');
    } else {
      setEditingId(null);
      const isWeekend = dow === 0 || dow === 6;
      const namaWeekend = dow === 6 ? 'Sabtu' : 'Minggu';
      setModeKbm(isWeekend ? 'Libur' : 'Luring');
      setStatusEfektif(isWeekend ? 'Tidak Efektif' : 'Efektif');
      setJamMulai(isWeekend ? '-' : '06:30');
      setJamSelesai(isWeekend ? '-' : '16:00');
      setKeterangan(isWeekend ? `Hari ${namaWeekend} (Libur Akhir Pekan)` : 'Hari Efektif Sekolah');
    }
  };

  const handleEditRow = (rec: KalenderRecord) => {
    setEditingId(rec.id);
    setTanggal(String(rec.tanggal).slice(0, 10));
    setSelectedYm(String(rec.tanggal).slice(0, 7));
    setModeKbm(rec.modeKbm);
    setStatusEfektif(rec.statusEfektif);
    setJamMulai(rec.jamMulai || '-');
    setJamSelesai(rec.jamSelesai || '-');
    setKeterangan(rec.keterangan || '');
    setFeedback(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const shiftMonth = (delta: number) => {
    const [yStr, mStr] = selectedYm.split('-');
    const d = new Date(Number(yStr), Number(mStr) - 1 + delta, 1);
    setSelectedYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        tanggal,
        modeKbm,
        statusEfektif,
        jamMulai: modeKbm === 'Libur' ? '-' : jamMulai || '06:30',
        jamSelesai: modeKbm === 'Libur' ? '-' : jamSelesai || '16:00',
        keterangan: keterangan.trim() || (statusEfektif === 'Tidak Efektif' ? 'Tidak Efektif KBM' : 'Hari Efektif Sekolah'),
      };
      const res = editingId
        ? await apiRequest<{ message: string }>(`/api/kalender/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ message: string }>('/api/kalender', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      setSelectedYm(tanggal.slice(0, 7));
      setEditingId(null);
      setFeedback({ type: 'success', text: res.message });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan tanggal Kalender Sekolah.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = () => {
    const [yStr, mStr] = selectedYm.split('-');
    const year = Number(yStr) || 2026;
    const monthIdx = (Number(mStr) || 1) - 1;
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const lines = ['tanggal,mode_kbm,status_efektif,jam_mulai,jam_selesai,keterangan'];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const existing = kalenderMap.get(dateStr);
      const dow = new Date(year, monthIdx, d).getDay();
      const isWeekend = dow === 0 || dow === 6;
      const mode = existing?.modeKbm || (isWeekend ? 'Libur' : 'Luring');
      const status = existing?.statusEfektif || (isWeekend ? 'Tidak Efektif' : 'Efektif');
      const jm = existing?.jamMulai || (mode === 'Libur' ? '-' : '06:30');
      const js = existing?.jamSelesai || (mode === 'Libur' ? '-' : '16:00');
      const ket =
        existing?.keterangan ||
        (dow === 6 ? 'Hari Sabtu (Libur Akhir Pekan)' : dow === 0 ? 'Hari Minggu (Libur Akhir Pekan)' : 'Hari Efektif KBM');
      lines.push(`${dateStr},${mode},${status},${jm},${js},"${ket.replace(/"/g, '""')}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Kalender_Sekolah_${selectedYm}.csv`;
    link.click();
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canManage) return;
    setImporting(true);
    setFeedback(null);
    try {
      const csvContent = await file.text();
      const res = await apiRequest<{ message: string }>('/api/kalender/import', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
      });
      setFeedback({ type: 'success', text: res.message });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengimpor CSV Kalender Sekolah.',
      });
    } finally {
      setImporting(false);
    }
  };

  const [yStr, mStr] = selectedYm.split('-');
  const currentMonthLabel = `${BULAN_ID[(Number(mStr) || 1) - 1]} ${yStr}`;
  const filteredTableRows = showAllMonthsTable
    ? kalender
    : kalender.filter((k) => String(k.tanggal).startsWith(selectedYm));

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-2.5">
          <CalendarDays className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Kalender Sekolah (Hari Efektif, Kegiatan Sekolah &amp; Libur)
              </h3>
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                Tahun Ajaran {tahunAjaran}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Default libur akhir pekan: <strong>Sabtu &amp; Minggu</strong>. Klik tanggal pada kalender atau tombol Edit untuk mengubah hari efektif / tidak efektif (Kegiatan Sekolah atau Libur Nasional).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Template CSV ({selectedYm})</span>
          </button>
          {canManage && (
            <label className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition">
              <Upload className="w-3.5 h-3.5" />
              <span>{importing ? 'Mengimpor...' : 'Import Kalender CSV'}</span>
              <input
                type="file"
                accept=".csv,.txt"
                disabled={importing}
                onChange={handleImportCsv}
                className="sr-only"
              />
            </label>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-700 dark:text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Navigator Bulan di Tahun Ajaran */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400"
            aria-label="Bulan Sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={selectedYm}
            onChange={(e) => setSelectedYm(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
          >
            {!taMonths.some((m) => m.ym === selectedYm) && (
              <option value={selectedYm}>{currentMonthLabel}</option>
            )}
            {taMonths.map((m) => (
              <option key={m.ym} value={m.ym}>
                {m.label} (TA {tahunAjaran})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400"
            aria-label="Bulan Berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedYm(todayStr.slice(0, 7));
              setTanggal(todayStr);
            }}
            className="px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold"
          >
            Bulan Ini
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            Efektif Luring: {monthSummary.efektifLuring}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
            Daring: {monthSummary.efektifDaring}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            Kegiatan Sekolah: {monthSummary.kegiatanSekolah}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
            Libur (Sabtu/Minggu/Nasional): {monthSummary.libur}
          </span>
        </div>
      </div>

      {/* Visual Monthly Calendar Grid */}
      <div className="space-y-2">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">
          <div>Sen</div>
          <div>Sel</div>
          <div>Rab</div>
          <div>Kam</div>
          <div>Jum</div>
          <div className="text-rose-500">Sab</div>
          <div className="text-rose-500">Min</div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {calendarCells.map((cell, idx) => {
            if (!cell.dateStr || !cell.dayNum) {
              return <div key={`empty-${idx}`} className="h-16 sm:h-20 rounded-xl bg-slate-50/40 dark:bg-slate-800/20" />;
            }
            const rec = cell.record;
            const isSelected = tanggal === cell.dateStr;
            const isToday = todayStr === cell.dateStr;
            const isKegiatan = isKegiatanSekolahRecord(rec);
            const isLibur = !isKegiatan && (rec ? rec.modeKbm === 'Libur' || rec.statusEfektif === 'Tidak Efektif' : cell.isWeekend);
            const isDaring = rec?.modeKbm === 'Daring' && rec?.statusEfektif === 'Efektif';

            const tileStyle = isKegiatan
              ? 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-300 dark:border-amber-800/70 text-amber-900 dark:text-amber-200'
              : isLibur
                ? 'bg-rose-50/90 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200'
                : isDaring
                  ? 'bg-blue-50/90 dark:bg-blue-950/35 border-blue-200 dark:border-blue-800/70 text-blue-800 dark:text-blue-200'
                  : 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200';

            const badgeLabel = rec
              ? isKegiatan
                ? 'Kegiatan'
                : rec.statusEfektif === 'Tidak Efektif'
                  ? 'Libur'
                  : rec.modeKbm
              : cell.isWeekend
                ? 'Libur'
                : 'Luring';

            const subLabel =
              rec?.keterangan || (cell.dow === 6 ? 'Sabtu' : cell.dow === 0 ? 'Minggu' : 'Efektif');

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => handleSelectCalendarDate(cell.dateStr!, cell.dow, rec)}
                className={`group h-16 sm:h-20 p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between transition ${tileStyle} ${
                  isSelected ? 'ring-2 ring-indigo-600 border-indigo-600' : 'hover:brightness-95'
                } ${isToday ? 'shadow-md' : ''}`}
              >
                <div className="flex items-center justify-between w-full gap-1">
                  <span className="text-xs font-extrabold tabular-nums">{cell.dayNum}</span>
                  <div className="flex items-center gap-1">
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-bold">
                        Hari Ini
                      </span>
                    )}
                    {canManage && (
                      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
                    )}
                  </div>
                </div>
                <div className="w-full overflow-hidden">
                  <div className="text-[10px] font-bold truncate">{badgeLabel}</div>
                  <div className="text-[9px] opacity-80 truncate">{subLabel}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form Edit / Update Status Tanggal */}
      {canManage && (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Pencil className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span className="font-bold text-slate-900 dark:text-white">
                {editingId ? 'Edit Entri Kalender' : 'Atur Status Tanggal'}:{' '}
                <span className="text-indigo-600 dark:text-indigo-400">
                  {tanggal ? formatHariTanggal(tanggal) : '-'}
                </span>
              </span>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setTanggal(todayStr);
                  applyPreset('efektif_luring');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Batal Edit</span>
              </button>
            )}
          </div>

          {/* Preset Cepat Status Hari */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1">
              Preset Cepat:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('efektif_luring')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition ${
                statusEfektif === 'Efektif' && modeKbm === 'Luring'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              Efektif (Luring)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('efektif_daring')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition ${
                statusEfektif === 'Efektif' && modeKbm === 'Daring'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-300'
              }`}
            >
              Efektif (Daring)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('kegiatan_sekolah')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition ${
                statusEfektif === 'Tidak Efektif' && modeKbm !== 'Libur'
                  ? 'bg-amber-600 border-amber-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-300'
              }`}
            >
              Tidak Efektif · Kegiatan Sekolah
            </button>
            <button
              type="button"
              onClick={() => applyPreset('libur_nasional')}
              className={`px-3 py-1.5 rounded-lg border font-bold transition ${
                statusEfektif === 'Tidak Efektif' && modeKbm === 'Libur'
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-rose-700 dark:text-rose-300'
              }`}
            >
              Tidak Efektif · Libur Nasional
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Tanggal</label>
              <input
                type="date"
                required
                value={tanggal}
                onChange={(e) => {
                  setTanggal(e.target.value);
                  if (e.target.value) setSelectedYm(e.target.value.slice(0, 7));
                }}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Status Hari Efektif</label>
              <select
                value={statusEfektif}
                onChange={(e) => {
                  const val = e.target.value as 'Efektif' | 'Tidak Efektif';
                  setStatusEfektif(val);
                  if (val === 'Efektif') {
                    if (modeKbm === 'Libur') setModeKbm('Luring');
                    if (jamMulai === '-') setJamMulai('06:30');
                    if (jamSelesai === '-') setJamSelesai('16:00');
                    if (!keterangan || keterangan.toLowerCase().includes('libur')) {
                      setKeterangan('Hari Efektif Sekolah');
                    }
                  } else if (!keterangan || keterangan.toLowerCase().includes('efektif sekolah')) {
                    setKeterangan('Kegiatan Sekolah / Tidak Efektif KBM');
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold"
              >
                <option value="Efektif">Efektif (KBM Berjalan)</option>
                <option value="Tidak Efektif">Tidak Efektif (Kegiatan / Libur)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Mode Kehadiran</label>
              <select
                value={modeKbm}
                onChange={(e) => {
                  const v = e.target.value as 'Luring' | 'Daring' | 'Libur';
                  setModeKbm(v);
                  if (v === 'Libur') {
                    setStatusEfektif('Tidak Efektif');
                    setJamMulai('-');
                    setJamSelesai('-');
                  } else {
                    if (jamMulai === '-') setJamMulai('06:30');
                    if (jamSelesai === '-') setJamSelesai('16:00');
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold"
              >
                <option value="Luring">Luring (Sekolah)</option>
                <option value="Daring">Daring (Online)</option>
                <option value="Libur">Libur (Tutup)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Jam Mulai</label>
              <input
                type="time"
                disabled={modeKbm === 'Libur'}
                value={jamMulai === '-' ? '' : jamMulai}
                onChange={(e) => setJamMulai(e.target.value || '-')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Jam Selesai</label>
              <input
                type="time"
                disabled={modeKbm === 'Libur'}
                value={jamSelesai === '-' ? '' : jamSelesai}
                onChange={(e) => setJamSelesai(e.target.value || '-')}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">Keterangan</label>
              <input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Kegiatan Sekolah / Libur Nasional..."
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          {statusEfektif === 'Tidak Efektif' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold text-slate-500 mr-1">Contoh Keterangan Cepat:</span>
              {[
                'Kegiatan Sekolah: Classmeeting',
                'Kegiatan Sekolah: Rapat Dewan Guru',
                'Kegiatan Sekolah: MPLS / Pengenalan',
                'Kegiatan Sekolah: Pembagian Rapor',
                'Kegiatan Sekolah: Peringatan Hari Besar',
                'Libur Nasional',
                'Cuti Bersama Nasional',
              ].map((contoh) => (
                <button
                  key={contoh}
                  type="button"
                  onClick={() => {
                    setKeterangan(contoh);
                    if (contoh.toLowerCase().includes('libur') || contoh.toLowerCase().includes('cuti')) {
                      setModeKbm('Libur');
                      setJamMulai('-');
                      setJamSelesai('-');
                    } else {
                      if (modeKbm === 'Libur') setModeKbm('Luring');
                      if (jamMulai === '-') setJamMulai('07:00');
                      if (jamSelesai === '-') setJamSelesai('12:00');
                    }
                  }}
                  className="px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[10px] font-semibold text-slate-700 dark:text-slate-300"
                >
                  {contoh}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Format CSV Import: <code className="font-mono">tanggal,mode_kbm,status_efektif,jam_mulai,jam_selesai,keterangan</code>
            </span>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 disabled:opacity-50 text-white font-bold inline-flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan Tanggal' : 'Update Tanggal ke Kalender Sekolah'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Daftar Entri Tersimpan */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300">
            Status Tanggal Tersimpan ({showAllMonthsTable ? 'Semua Bulan' : currentMonthLabel})
          </span>
          <button
            type="button"
            onClick={() => setShowAllMonthsTable((v) => !v)}
            className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
          >
            {showAllMonthsTable ? `Filter Bulan ${currentMonthLabel}` : 'Tampilkan Semua Bulan'}
          </button>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Tanggal</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Status Hari</th>
                <th className="p-3">Jam Efektif</th>
                <th className="p-3">Keterangan</th>
                {canManage && <th className="p-3 text-center">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredTableRows.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="p-6 text-center text-slate-500">
                    Belum ada pengaturan khusus pada periode ini (Senin–Jumat otomatis Efektif Luring, Sabtu &amp; Minggu default Libur / Tidak Efektif).
                  </td>
                </tr>
              ) : (
                filteredTableRows.map((k) => {
                  const isKeg = isKegiatanSekolahRecord(k);
                  const isEfektif = k.statusEfektif === 'Efektif' && k.modeKbm !== 'Libur';
                  return (
                    <tr key={k.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-semibold">{formatHariTanggal(k.tanggal)}</td>
                      <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{k.modeKbm}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            isKeg
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : isEfektif
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {isKeg ? 'Tidak Efektif (Kegiatan)' : k.statusEfektif}
                        </span>
                      </td>
                      <td className="p-3 font-mono tabular-nums">
                        {k.jamMulai} - {k.jamSelesai}
                      </td>
                      <td className="p-3">{k.keterangan}</td>
                      {canManage && (
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditRow(k)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 font-semibold inline-flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/kalender/${k.id}`, { method: 'DELETE' });
                                if (editingId === k.id) setEditingId(null);
                                await onRefresh();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 font-semibold"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. ABSENSI KELAS (INPUT BATCH)
 * ========================================================================== */
export const AbsensiKelasView: React.FC<{
  todayStr?: string;
  siswa: SiswaRecord[];
  kehadiran: KehadiranSiswaRecord[];
  onRefresh: () => Promise<void>;
}> = ({ todayStr, siswa, kehadiran, onRefresh }) => {
  const effectiveToday = todayStr || getTodayWIB();
  const prevTodayRef = useRef(effectiveToday);
  const [tanggal, setTanggal] = useState(effectiveToday);
  const [kelas, setKelas] = useState('');
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [savedMsg, setSavedMsg] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const kelasList = useMemo(() => Array.from(new Set(siswa.map((s) => s.kelas))).sort(), [siswa]);
  const siswaKelas = useMemo(() => (kelas ? siswa.filter((s) => s.kelas === kelas) : []), [siswa, kelas]);
  const targetDate = String(tanggal || '').slice(0, 10);

  // Auto-rollover tanggal & reset status ke default Hadir saat berganti hari (00:00 WIB)
  useEffect(() => {
    if (prevTodayRef.current !== effectiveToday) {
      prevTodayRef.current = effectiveToday;
      setTanggal(effectiveToday);
      setSavedMsg('');
      setStatusMap((prev) => {
        if (!kelas) return {};
        const reset: Record<string, AttendanceStatus> = {};
        for (const nis of Object.keys(prev)) {
          reset[nis] = 'Hadir';
        }
        return reset;
      });
    }
  }, [effectiveToday, kelas]);

  const hasSavedAttendanceForDate = useMemo(() => {
    if (!kelas || siswaKelas.length === 0) return false;
    return siswaKelas.some((s) =>
      kehadiran.some((k) => String(k.tglAbsen || '').slice(0, 10) === targetDate && k.nis === s.nis)
    );
  }, [kelas, siswaKelas, kehadiran, targetDate]);

  // Populate default Hadir — histori kemarin/hari lain tidak pernah terbawa saat ganti tanggal
  useEffect(() => {
    if (!kelas) {
      setStatusMap({});
      return;
    }
    const next: Record<string, AttendanceStatus> = {};
    siswaKelas.forEach((s) => {
      const rec = kehadiran.find(
        (k) => String(k.tglAbsen || '').slice(0, 10) === targetDate && k.nis === s.nis
      );
      next[s.nis] = rec ? normalizeAttendanceStatus(rec.status) : 'Hadir';
    });
    setStatusMap(next);
  }, [kelas, siswaKelas, kehadiran, targetDate]);

  const handleTanggalChange = (newTanggal: string) => {
    setTanggal(newTanggal);
    setSavedMsg('');
    if (siswaKelas.length > 0) {
      const freshDefault: Record<string, AttendanceStatus> = {};
      siswaKelas.forEach((s) => {
        freshDefault[s.nis] = 'Hadir';
      });
      setStatusMap(freshDefault);
    }
  };

  const handleKelasChange = (newKelas: string) => {
    setKelas(newKelas);
    setSavedMsg('');
  };

  const handleResetAllHadir = () => {
    const freshDefault: Record<string, AttendanceStatus> = {};
    siswaKelas.forEach((s) => {
      freshDefault[s.nis] = 'Hadir';
    });
    setStatusMap(freshDefault);
    setSavedMsg('');
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      const freshDefault: Record<string, AttendanceStatus> = {};
      siswaKelas.forEach((s) => {
        const rec = kehadiran.find(
          (k) => String(k.tglAbsen || '').slice(0, 10) === targetDate && k.nis === s.nis
        );
        freshDefault[s.nis] = rec ? normalizeAttendanceStatus(rec.status) : 'Hadir';
      });
      setStatusMap(freshDefault);
    } finally {
      setRefreshing(false);
    }
  };

  const statusSummary = useMemo(() => {
    const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, Terlambat: 0 };
    siswaKelas.forEach((s) => {
      const st = statusMap[s.nis] || 'Hadir';
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [siswaKelas, statusMap]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const batch = siswaKelas.map((s) => ({
        tglAbsen: tanggal,
        nis: s.nis,
        nama: s.nama,
        kelas: s.kelas,
        jurusan: s.jurusan,
        jk: s.jk,
        status: statusMap[s.nis] || 'Hadir',
      }));
      const res = await apiRequest<{ message: string }>('/api/absensi/batch', {
        method: 'POST',
        body: JSON.stringify({ batch }),
      });
      setSavedMsg(res.message);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Input &amp; Update Presensi Keseluruhan Kelas
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Status siswa otomatis default HADIR setiap ganti hari; histori kemarin tidak terbawa.
          </p>
        </div>
        {kelas && (
          <span
            className={`self-start sm:self-auto px-2.5 py-1 rounded-lg text-[11px] font-bold ${
              hasSavedAttendanceForDate
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
            }`}
          >
            {hasSavedAttendanceForDate
              ? `Data Tersimpan (${formatHariTanggal(tanggal)})`
              : 'Default HADIR (Hari Baru)'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl text-xs">
        <input
          type="date"
          value={tanggal}
          onChange={(e) => handleTanggalChange(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
        />
        <select
          value={kelas}
          onChange={(e) => handleKelasChange(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
        >
          <option value="">-- Pilih Kelas --</option>
          {kelasList.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {savedMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          {savedMsg}
        </div>
      )}

      {kelas && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="text-slate-600 dark:text-slate-300">
              Ringkasan: <b className="text-emerald-600">Hadir {statusSummary.Hadir}</b> ·{' '}
              <b className="text-blue-600">Ijin {statusSummary.Izin}</b> ·{' '}
              <b className="text-yellow-600">Sakit {statusSummary.Sakit}</b> ·{' '}
              <b className="text-red-600">Alpha {statusSummary.Alpa}</b> ·{' '}
              <b className="text-orange-600">Terlambat {statusSummary.Terlambat}</b>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshStatus}
                disabled={refreshing}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh Status</span>
              </button>
              <button
                type="button"
                onClick={handleResetAllHadir}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Default Semua Hadir</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3">NIS</th>
                  <th className="p-3">Nama Siswa</th>
                  <th className="p-3">JK</th>
                  <th className="p-3 text-center min-w-[300px]">Status Kehadiran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {siswaKelas.map((s) => (
                  <tr key={s.nis} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{s.nis}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{s.nama}</td>
                    <td className="p-3">{s.jk}</td>
                    <td className="p-3 text-center">
                      <AttendanceStatusButtons
                        value={statusMap[s.nis] || 'Hadir'}
                        onChange={(nextStatus) =>
                          setStatusMap((prev) => ({
                            ...prev,
                            [s.nis]: nextStatus,
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 disabled:opacity-50 text-white text-xs font-bold shadow"
            >
              {saving ? 'Menyimpan...' : 'Simpan Presensi Kelas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 4. KELOLA JADWAL MENGAJAR & MASTER JADWAL KELAS (USER-SCOPED UNLESS ADMIN)
 * ========================================================================== */
export const KelolaJadwalGuruView: React.FC<{
  user: AuthUser;
  jadwal: JadwalRecord[];
  siswa: SiswaRecord[];
  mapelList: string[];
  onRefresh: () => Promise<void>;
}> = ({ user, jadwal, siswa, mapelList, onRefresh }) => {
  const [hari, setHari] = useState('Senin');
  const [jamMulai, setJamMulai] = useState(1);
  const [jamSelesai, setJamSelesai] = useState(2);
  const [kelas, setKelas] = useState('');
  const [mapel, setMapel] = useState('');
  const [ruang, setRuang] = useState('');
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [submitFeedback, setSubmitFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const kelasList = useMemo(
    () => Array.from(new Set([...siswa.map((s) => s.kelas), ...jadwal.map((j) => j.kelas)])).filter(Boolean).sort(),
    [siswa, jadwal]
  );

  const activeJamLabel = useMemo(() => {
    const m = JAM_KBM_MATRIX.find((j) => j.id === jamMulai) || JAM_KBM_MATRIX[0];
    const s = JAM_KBM_MATRIX.find((j) => j.id === Math.max(jamMulai, jamSelesai)) || m;
    return `${m.label} - ${s.label} (${m.mulai} - ${s.selesai} WIB)`;
  }, [jamMulai, jamSelesai]);

  useEffect(() => {
    if (!kelas) {
      setConflictWarning(null);
      return;
    }

    const startId = jamMulai;
    const endId = Math.max(jamMulai, jamSelesai);

    // Instant local check on visible jadwal
    const localHit = jadwal.find((j) => {
      if (j.hari.trim().toLowerCase() !== hari.trim().toLowerCase()) return false;
      const exRange = parseJamKeRangeFromJadwal(j.jam);
      const overlaps =
        exRange.start !== null && exRange.end !== null
          ? startId <= exRange.end && endId >= exRange.start
          : j.jam.trim().toLowerCase() === activeJamLabel.trim().toLowerCase();
      if (!overlaps) return false;
      return (
        j.kelas.trim().toLowerCase() === kelas.trim().toLowerCase() ||
        j.guru.trim().toLowerCase() === user.nama.trim().toLowerCase()
      );
    });

    if (localHit) {
      if (localHit.kelas.trim().toLowerCase() === kelas.trim().toLowerCase()) {
        setConflictWarning(
          `Peringatan! Kelas ${kelas} pada hari ${hari} (${localHit.jam}) sudah memiliki jadwal mengajar oleh ${localHit.guru} (${localHit.mapel}). Jadwal di kelas & jam yang sama tidak bisa disimpan.`
        );
      } else {
        setConflictWarning(
          `Peringatan! Guru ${localHit.guru} sudah memiliki jadwal di kelas ${localHit.kelas} pada hari ${hari} (${localHit.jam}). Tidak bisa membuat jadwal bentrok pada jam yang sama.`
        );
      }
    }

    // Authoritative server check across ALL teachers' schedules
    let cancelled = false;
    const params = new URLSearchParams({
      hari,
      jam: activeJamLabel,
      kelas,
    });
    apiRequest<{ status: boolean; conflict: boolean; message: string }>(
      `/api/jadwal/check-conflict?${params.toString()}`
    )
      .then((res) => {
        if (cancelled) return;
        setConflictWarning(res.conflict ? res.message : null);
      })
      .catch(() => {
        // Fallback to local check if network temporarily unavailable
      });

    return () => {
      cancelled = true;
    };
  }, [hari, jamMulai, jamSelesai, kelas, activeJamLabel, jadwal, user.nama]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (conflictWarning) {
      setSubmitFeedback({ type: 'error', text: conflictWarning });
      return;
    }
    setSaving(true);
    setSubmitFeedback(null);
    try {
      const res = await apiRequest<{ status: boolean; message: string }>('/api/jadwal', {
        method: 'POST',
        body: JSON.stringify({ hari, jam: activeJamLabel, kelas, mapel, ruang: ruang || 'Ruang Utama' }),
      });
      setRuang('');
      setSubmitFeedback({ type: 'success', text: res.message });
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan jadwal.';
      setConflictWarning(msg);
      setSubmitFeedback({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Kelola Jadwal Mengajar Guru</h3>
        <p className="text-xs text-slate-500">
          Menampilkan jadwal khusus untuk {user.role === 'admin' ? 'seluruh guru (Admin)' : user.nama}.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs"
      >
        <select
          value={hari}
          onChange={(e) => setHari(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold"
        >
          {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select
          value={jamMulai}
          onChange={(e) => {
            const val = Number(e.target.value);
            setJamMulai(val);
            if (jamSelesai < val) setJamSelesai(val);
          }}
          className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
        >
          {JAM_KBM_MATRIX.map((j) => (
            <option key={j.id} value={j.id}>
              Mulai {j.label} ({j.mulai})
            </option>
          ))}
        </select>
        <select
          value={jamSelesai}
          onChange={(e) => setJamSelesai(Number(e.target.value))}
          className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
        >
          {JAM_KBM_MATRIX.filter((j) => j.id >= jamMulai).map((j) => (
            <option key={j.id} value={j.id}>
              Sampai {j.label} ({j.selesai})
            </option>
          ))}
        </select>
        <select
          required
          value={kelas}
          onChange={(e) => setKelas(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
        >
          <option value="">-- Pilih Kelas --</option>
          {kelasList.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          required
          value={mapel}
          onChange={(e) => setMapel(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold"
        >
          <option value="">-- Pilih Mapel --</option>
          {mapelList.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={ruang}
          onChange={(e) => setRuang(e.target.value)}
          placeholder="Ruang / Lab"
          className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
        />

        {conflictWarning && (
          <div className="sm:col-span-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-200 flex items-start gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{conflictWarning}</span>
          </div>
        )}

        {submitFeedback && !conflictWarning && (
          <div
            className={`sm:col-span-3 p-3 rounded-xl border font-semibold ${
              submitFeedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-700 dark:text-rose-300'
            }`}
          >
            {submitFeedback.text}
          </div>
        )}

        <div className="sm:col-span-3 flex justify-end">
          <button
            type="submit"
            disabled={saving || Boolean(conflictWarning)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition"
          >
            {saving
              ? 'Menyimpan...'
              : conflictWarning
              ? 'Jadwal Bentrok — Tidak Bisa Simpan'
              : 'Simpan Jadwal'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <th className="p-3">Hari</th>
              <th className="p-3">Jam</th>
              <th className="p-3">Kelas</th>
              <th className="p-3">Mata Pelajaran</th>
              <th className="p-3">Guru</th>
              <th className="p-3">Ruang</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {jadwal.map((j) => (
              <tr key={j.id}>
                <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{j.hari}</td>
                <td className="p-3 font-mono">{j.jam}</td>
                <td className="p-3 font-bold">{j.kelas}</td>
                <td className="p-3">{j.mapel}</td>
                <td className="p-3">{j.guru}</td>
                <td className="p-3">{j.ruang}</td>
                <td className="p-3 text-center">
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/jadwal/${j.id}`, { method: 'DELETE' });
                      await onRefresh();
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 font-semibold"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const MasterJadwalView: React.FC<{ user: AuthUser; jadwal: JadwalRecord[] }> = ({ user, jadwal }) => (
  <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
    <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Master Jadwal Kelas</h3>
        <p className="text-xs text-slate-500">
          {user.role === 'admin'
            ? 'Menampilkan seluruh jadwal kelas (Akses Penuh Admin).'
            : `Menampilkan jadwal khusus sesuai akun login Anda (${user.nama}).`}
        </p>
      </div>
      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
        {jadwal.length} Jadwal
      </span>
    </div>
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
            <th className="p-3">Hari</th>
            <th className="p-3">Jam</th>
            <th className="p-3">Kelas</th>
            <th className="p-3">Mata Pelajaran</th>
            <th className="p-3">Guru Pengampu</th>
            <th className="p-3">Ruang</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {jadwal.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-slate-500">
                Tidak ada jadwal yang terhubung dengan akun Anda.
              </td>
            </tr>
          ) : (
            jadwal.map((j) => (
              <tr key={j.id}>
                <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">{j.hari}</td>
                <td className="p-3 font-mono">{j.jam}</td>
                <td className="p-3 font-semibold text-slate-900 dark:text-white">{j.kelas}</td>
                <td className="p-3">{j.mapel}</td>
                <td className="p-3">{j.guru}</td>
                <td className="p-3">{j.ruang}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

/* ============================================================================
 * 5. MONITORING JURNAL SAYA
 * ========================================================================== */
export const MonitoringJurnalView: React.FC<{ jurnal: JurnalRecord[] }> = ({ jurnal }) => (
  <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
    <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">
      Laporan Jurnal Harian Saya
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {jurnal.length === 0 ? (
        <p className="text-xs text-slate-500 col-span-full py-6 text-center">
          Belum ada catatan jurnal harian yang disimpan.
        </p>
      ) : (
        jurnal.map((j) => (
          <div
            key={j.id}
            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs"
          >
            <div className="flex justify-between font-bold text-indigo-600 dark:text-indigo-400">
              <span>
                {j.kelas} · {j.mapel} ({j.jamKe})
              </span>
              <span>{formatHariTanggal(j.tanggal)}</span>
            </div>
            <p className="font-bold text-slate-900 dark:text-white">{j.materi}</p>
            <p className="text-slate-500 dark:text-slate-400">
              Guru: {j.guruNama} · Metode: {j.metode}
            </p>
          </div>
        ))
      )}
    </div>
  </div>
);

/* ============================================================================
 * 6. DATA PENGGUNA (ADMIN CRUD)
 * ========================================================================== */
export const DataPenggunaView: React.FC<{
  users: UserAccountRecord[];
  onRefresh: () => Promise<void>;
}> = ({ users, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [nisNip, setNisNip] = useState('');
  const [role, setRole] = useState<UserRole>('guru');
  const [jk, setJk] = useState('L');

  const openModal = (u?: UserAccountRecord) => {
    setEditId(u ? u.id : null);
    setUsername(u ? u.username : '');
    setPassword('');
    setNama(u ? u.nama : '');
    setNisNip(u ? u.nisNip : '');
    setRole(u ? u.role : 'guru');
    setJk(u ? u.jk : 'L');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      await apiRequest(`/api/users/${editId}`, {
        method: 'PUT',
        body: JSON.stringify({ username, password, nama, nisNip, role, jk }),
      });
    } else {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, nama, nisNip, role, jk }),
      });
    }
    setModalOpen(false);
    await onRefresh();
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Data Pengguna (Admin, Guru &amp; Karyawan)
        </h3>
        <button
          type="button"
          onClick={() => openModal()}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-bold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah User</span>
        </button>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <th className="p-3">Username</th>
              <th className="p-3">Nama Lengkap</th>
              <th className="p-3">NIP / ID</th>
              <th className="p-3">Role</th>
              <th className="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{u.username}</td>
                <td className="p-3 font-semibold text-slate-900 dark:text-white">{u.nama}</td>
                <td className="p-3">{u.nisNip}</td>
                <td className="p-3 uppercase font-bold">{u.role}</td>
                <td className="p-3 text-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => openModal(u)}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 font-semibold inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                  {u.username !== 'admin' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/users/${u.id}`, { method: 'DELETE' });
                        await onRefresh();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 font-semibold"
                    >
                      Hapus
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editId ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <input
                  type="password"
                  required={!editId}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editId ? 'Kosongkan jika tetap' : 'Password'}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <input
                type="text"
                required
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Nama Lengkap"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={nisNip}
                  onChange={(e) => setNisNip(e.target.value)}
                  placeholder="NIP / ID"
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                >
                  <option value="guru">Guru</option>
                  <option value="karyawan">Karyawan</option>
                  <option value="admin">Admin</option>
                </select>
                <select
                  value={jk}
                  onChange={(e) => setJk(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="L">L</option>
                  <option value="P">P</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold"
              >
                Simpan Pengguna
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
 * 7. JURUSAN, HAK AKSES, PENGATURAN SEKOLAH (LOGO, ALAMAT, NAMA SEKOLAH), PROFIL
 * ========================================================================== */
export const JurusanView: React.FC<{
  user?: AuthUser;
  pengaturan?: PengaturanSekolah;
  jurusan: JurusanRecord[];
  onRefresh?: () => Promise<void>;
}> = ({ user, pengaturan, jurusan, onRefresh }) => {
  const canEdit = user?.role === 'admin' || user?.role === 'guru';
  const [editId, setEditId] = useState<number | null>(null);
  const [kode, setKode] = useState('');
  const [nama, setNama] = useState('');
  const [kurikulum, setKurikulum] = useState('Kurikulum Merdeka');
  const [fasilitas, setFasilitas] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const startEdit = (j: JurusanRecord) => {
    setEditId(j.id);
    setKode(j.kode);
    setNama(j.nama);
    setKurikulum(j.kurikulum);
    setFasilitas(j.fasilitas);
    setFeedback(null);
  };

  const resetForm = () => {
    setEditId(null);
    setKode('');
    setNama('');
    setKurikulum('Kurikulum Merdeka');
    setFasilitas('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = editId
        ? await apiRequest<{ message: string }>(`/api/jurusan/${editId}`, {
            method: 'PUT',
            body: JSON.stringify({ kode, nama, kurikulum, fasilitas }),
          })
        : await apiRequest<{ message: string }>('/api/jurusan', {
            method: 'POST',
            body: JSON.stringify({ kode, nama, kurikulum, fasilitas }),
          });
      setFeedback({ type: 'success', text: res.message });
      resetForm();
      if (onRefresh) await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan data jurusan.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!canEdit) return;
    setFeedback(null);
    await apiRequest(`/api/jurusan/${id}`, { method: 'DELETE' });
    if (editId === id) resetForm();
    if (onRefresh) await onRefresh();
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Jurusan &amp; Kurikulum ({pengaturan?.jenjangSekolah || 'SMK'})
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
              Khusus Jenjang SMK
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kelola kompetensi keahlian / jurusan serta kurikulum sekolah kejuruan Anda.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-700 dark:text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {canEdit && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs"
        >
          <input
            type="text"
            required
            value={kode}
            onChange={(e) => setKode(e.target.value)}
            placeholder="Kode (cth: TKJ / RPL)"
            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold uppercase"
          />
          <input
            type="text"
            required
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Nama Kompetensi Keahlian / Jurusan"
            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
          />
          <input
            type="text"
            value={kurikulum}
            onChange={(e) => setKurikulum(e.target.value)}
            placeholder="Kurikulum (cth: Kurikulum Merdeka)"
            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
          />
          <input
            type="text"
            value={fasilitas}
            onChange={(e) => setFasilitas(e.target.value)}
            placeholder="Fasilitas / Lab"
            className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
          />
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
            {editId !== null && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold"
              >
                Batal Edit
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : editId !== null ? 'Update Jurusan' : 'Tambah Jurusan'}</span>
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {jurusan.map((j) => (
          <div
            key={j.id}
            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 text-xs"
          >
            <div className="space-y-1">
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{j.kode}</span>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{j.nama}</h4>
              <p className="text-slate-500 dark:text-slate-400">
                {j.kurikulum} · {j.fasilitas}
              </p>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(j)}
                  className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 hover:bg-blue-100"
                  title="Edit Jurusan"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(j.id)}
                  className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100"
                  title="Hapus Jurusan"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const HakAksesView: React.FC<{
  hakAkses: HakAksesItem[];
  onRefresh: () => Promise<void>;
}> = ({ hakAkses, onRefresh }) => {
  const [items, setItems] = useState<HakAksesItem[]>(hakAkses);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setItems(hakAkses);
  }, [hakAkses]);

  const toggle = (idx: number, key: 'guru' | 'karyawan' | 'siswa') => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: !it[key] } : it)));
    setSaved(false);
  };

  const handleSave = async () => {
    await apiRequest('/api/hak-akses', {
      method: 'PUT',
      body: JSON.stringify({ config: items }),
    });
    setSaved(true);
    await onRefresh();
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Pengaturan Hak Akses Role</h3>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-bold flex items-center gap-1.5"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Tersimpan' : 'Simpan Hak Akses'}</span>
        </button>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <th className="p-3">Fitur Aplikasi</th>
              <th className="p-3 text-center">Admin</th>
              <th className="p-3 text-center">Guru</th>
              <th className="p-3 text-center">Karyawan</th>
              <th className="p-3 text-center">Siswa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td className="p-3 font-semibold text-slate-900 dark:text-white">{item.nama}</td>
                <td className="p-3 text-center">
                  <input type="checkbox" checked={item.admin} disabled className="accent-indigo-600" />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.guru}
                    onChange={() => toggle(idx, 'guru')}
                    className="accent-indigo-600"
                  />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.karyawan}
                    onChange={() => toggle(idx, 'karyawan')}
                    className="accent-indigo-600"
                  />
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={item.siswa}
                    onChange={() => toggle(idx, 'siswa')}
                    className="accent-indigo-600"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PengaturanSekolahView: React.FC<{
  pengaturan: PengaturanSekolah;
  mysqlConfigured?: boolean;
  supabaseConfigured: boolean;
  liveTick?: number;
  onRefresh: () => Promise<void>;
}> = ({ pengaturan, mysqlConfigured = false, supabaseConfigured, liveTick = 0, onRefresh }) => {
  const [form, setForm] = useState<PengaturanSekolah>(pengaturan);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [dbMsg, setDbMsg] = useState('');
  const [dbMsgErr, setDbMsgErr] = useState(false);
  const [testingMysql, setTestingMysql] = useState(false);
  const [syncingMysql, setSyncingMysql] = useState(false);
  const [syncingCsv, setSyncingCsv] = useState(false);
  const [mysqlInfo, setMysqlInfo] = useState<{ schemaSql: string; phpTemplate: string } | null>(null);
  const [supabaseSql, setSupabaseSql] = useState('');

  useEffect(() => {
    setForm(pengaturan);
  }, [pengaturan]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMsg('Ukuran logo maksimal 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, logoSekolah: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const res = await apiRequest<{ message: string }>('/api/pengaturan', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setMsg(res.message);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleTestMysql = async () => {
    setTestingMysql(true);
    setDbMsg('');
    setDbMsgErr(false);
    try {
      const res = await apiRequest<{ ok: boolean; message: string }>('/api/admin/mysql-test');
      setDbMsgErr(!res.ok);
      setDbMsg(res.message);
    } catch (err) {
      setDbMsgErr(true);
      setDbMsg(err instanceof Error ? err.message : 'Gagal menguji koneksi MySQL.');
    } finally {
      setTestingMysql(false);
    }
  };

  const handleSyncMysql = async () => {
    setSyncingMysql(true);
    setDbMsg('');
    setDbMsgErr(false);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/mysql-sync', { method: 'POST' });
      setDbMsg(res.message);
    } catch (err) {
      setDbMsgErr(true);
      setDbMsg(err instanceof Error ? err.message : 'Gagal menyinkronkan ke MySQL.');
    } finally {
      setSyncingMysql(false);
    }
  };

  const handleDownloadMysqlDump = async () => {
    setDbMsg('');
    setDbMsgErr(false);
    try {
      await downloadProtectedFile('/api/admin/mysql-export.sql', 'db_absensi_export.sql');
      setDbMsg('File SQL lengkap (struktur tabel + seluruh data siswa) berhasil diunduh untuk diimpor ke phpMyAdmin.');
    } catch (err) {
      setDbMsgErr(true);
      setDbMsg(err instanceof Error ? err.message : 'Gagal mengunduh file SQL.');
    }
  };

  const handleSyncCsvDefault = async () => {
    setSyncingCsv(true);
    setDbMsg('');
    setDbMsgErr(false);
    try {
      const res = await apiRequest<{ message: string }>('/api/admin/import-siswa-csv', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setDbMsg(res.message);
      await onRefresh();
    } catch (err) {
      setDbMsgErr(true);
      setDbMsg(err instanceof Error ? err.message : 'Gagal menyinkronkan data CSV.');
    } finally {
      setSyncingCsv(false);
    }
  };

  const loadMysqlInfo = async () => {
    if (mysqlInfo) {
      setMysqlInfo(null);
      return;
    }
    const res = await apiRequest<{ schemaSql: string; phpTemplate: string }>('/api/admin/mysql-info');
    setMysqlInfo({ schemaSql: res.schemaSql, phpTemplate: res.phpTemplate });
  };

  const loadSupabaseSchema = async () => {
    if (supabaseSql) {
      setSupabaseSql('');
      return;
    }
    const res = await apiRequest<{ schema: string }>('/api/supabase-schema');
    setSupabaseSql(res.schema);
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSave}
        className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Pengaturan Sekolah (Logo, Alamat, Nama Sekolah &amp; GPS)
            </h3>
            <p className="text-xs text-slate-500">
              Identitas sekolah ini otomatis diterapkan pada Header, Halaman Login, dan Kop Surat PDF.
            </p>
          </div>
        </div>

        {msg && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {msg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Sekolah *
            </label>
            <input
              type="text"
              required
              value={form.namaSekolah}
              onChange={(e) => setForm({ ...form, namaSekolah: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Jenjang Sekolah (Menentukan Menu Jurusan)
            </label>
            <select
              value={form.jenjangSekolah || 'SMK'}
              onChange={(e) => setForm({ ...form, jenjangSekolah: e.target.value as JenjangSekolah })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
            >
              <option value="SMK">SMK (Menu Jurusan &amp; Kurikulum Aktif)</option>
              <option value="SMA">SMA (Menu Jurusan Disembunyikan)</option>
              <option value="SMP">SMP (Menu Jurusan Disembunyikan)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tahun Ajaran Aktif
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={form.tahunAjaran}
                onChange={(e) => setForm({ ...form, tahunAjaran: e.target.value })}
                placeholder="2026/2027"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
              />
              {['2025/2026', '2026/2027', '2027/2028'].map((ta) => (
                <button
                  key={ta}
                  type="button"
                  onClick={() => setForm({ ...form, tahunAjaran: ta })}
                  className={`px-2.5 py-2 rounded-lg text-[11px] font-bold border transition ${
                    form.tahunAjaran === ta
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {ta}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Alamat Sekolah *
            </label>
            <input
              type="text"
              required
              value={form.alamatSekolah}
              onChange={(e) => setForm({ ...form, alamatSekolah: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <label className="block font-semibold text-slate-700 dark:text-slate-300">
              Logo Sekolah (URL Gambar atau Upload File)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {form.logoSekolah && (
                <img
                  src={form.logoSekolah}
                  alt="Preview Logo"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-contain border border-slate-200 dark:border-slate-700 bg-white p-1"
                />
              )}
              <input
                type="text"
                value={form.logoSekolah}
                onChange={(e) => setForm({ ...form, logoSekolah: e.target.value })}
                placeholder="https://... atau unggah gambar logo"
                className="flex-1 w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <label className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-semibold cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap">
                <Upload className="w-4 h-4" />
                <span>Pilih Gambar</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="sr-only" />
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Latitude GPS Sekolah
            </label>
            <input
              type="number"
              step="any"
              value={form.latGps}
              onChange={(e) => setForm({ ...form, latGps: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Longitude GPS Sekolah
            </label>
            <input
              type="number"
              step="any"
              value={form.lngGps}
              onChange={(e) => setForm({ ...form, lngGps: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Radius Absensi GPS (Meter)
            </label>
            <input
              type="number"
              value={form.radiusMeter}
              onChange={(e) => setForm({ ...form, radiusMeter: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Footer Aplikasi
            </label>
            <input
              type="text"
              value={form.footerApp}
              onChange={(e) => setForm({ ...form, footerApp: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold shadow"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan Sekolah'}
          </button>
        </div>
      </form>

      {/* Panel Integrasi Database MySQL Online & Hosting */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-2.5">
            <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Integrasi Database MySQL Online (Hosting Web) &amp; Ekspor SQL
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Status Koneksi MySQL Online (via Secrets <code className="font-mono">MYSQL_*</code>):{' '}
                <strong className={mysqlConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {mysqlConfigured ? 'Aktif (Tersinkron Otomatis)' : 'Mode Lokal + Siap Ekspor .SQL ke Hosting'}
                </strong>
                {' · '}Supabase:{' '}
                <strong>{supabaseConfigured ? 'Aktif' : 'Opsional'}</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadMysqlDump}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download db_absensi.sql</span>
            </button>
            <button
              type="button"
              onClick={handleTestMysql}
              disabled={testingMysql}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{testingMysql ? 'Menguji...' : 'Uji Koneksi MySQL'}</span>
            </button>
            <button
              type="button"
              onClick={handleSyncMysql}
              disabled={syncingMysql}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingMysql ? 'animate-spin' : ''}`} />
              <span>{syncingMysql ? 'Menyinkronkan...' : 'Sync ke MySQL Online'}</span>
            </button>
            <button
              type="button"
              onClick={handleSyncCsvDefault}
              disabled={syncingCsv}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{syncingCsv ? 'Mengimpor...' : 'Sinkronkan CSV Siswa'}</span>
            </button>
            <button
              type="button"
              onClick={loadMysqlInfo}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Code className="w-3.5 h-3.5" />
              <span>{mysqlInfo ? 'Tutup Skema & PHP' : 'Skema MySQL & koneksi.php'}</span>
            </button>
            <button
              type="button"
              onClick={loadSupabaseSchema}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold whitespace-nowrap"
            >
              {supabaseSql ? 'Tutup SQL Supabase' : 'Skema Supabase'}
            </button>
          </div>
        </div>

        {dbMsg && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold ${
              dbMsgErr
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {dbMsg}
          </div>
        )}

        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Untuk mengimpor seluruh data siswa terbaru ke database hosting (<code className="font-mono">icdhdgev_admschool</code>), klik{' '}
          <strong>Download db_absensi.sql</strong> lalu unggah file tersebut melalui menu <strong>Import</strong> di phpMyAdmin hosting Anda.
          Jika server MySQL hosting mengizinkan akses remote, atur variabel <code className="font-mono">MYSQL_HOST</code>,{' '}
          <code className="font-mono">MYSQL_USER</code>, <code className="font-mono">MYSQL_PASSWORD</code>, dan{' '}
          <code className="font-mono">MYSQL_DATABASE</code> pada file <code className="font-mono">.env</code> / panel Secrets lalu klik <strong>Sync ke MySQL Online</strong>.
        </p>

        {mysqlInfo && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Template Koneksi PHP (koneksi.php - Aman tanpa hardcode sandi)
              </p>
              <pre className="p-4 rounded-xl bg-slate-950 text-sky-300 text-[11px] font-mono overflow-x-auto custom-scrollbar">
                {mysqlInfo.phpTemplate}
              </pre>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Skema Tabel MySQL (CREATE TABLE icdhdgev_admschool)
              </p>
              <pre className="p-4 rounded-xl bg-slate-950 text-emerald-300 text-[11px] font-mono overflow-x-auto max-h-64 custom-scrollbar">
                {mysqlInfo.schemaSql}
              </pre>
            </div>
          </div>
        )}

        {supabaseSql && (
          <pre className="p-4 rounded-xl bg-slate-950 text-emerald-300 text-[11px] font-mono overflow-x-auto max-h-64 custom-scrollbar">
            {supabaseSql}
          </pre>
        )}
      </div>

      {/* Panel Debug Koneksi Database Real-Time */}
      <DatabaseDebugPanel liveTick={liveTick} />
    </div>
  );
};

export const ProfileView: React.FC<{ user: AuthUser }> = ({ user }) => (
  <div className="max-w-lg mx-auto p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-center">
    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.nama}</h2>
    <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase">{user.role}</p>
    <div className="grid grid-cols-2 gap-3 text-left text-xs pt-2">
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
        <span className="block text-slate-500">Username</span>
        <strong className="text-slate-900 dark:text-white">{user.username}</strong>
      </div>
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
        <span className="block text-slate-500">NIS / NIP</span>
        <strong className="font-mono text-indigo-600 dark:text-indigo-400">{user.nisNip}</strong>
      </div>
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
        <span className="block text-slate-500">Kelas</span>
        <strong className="text-slate-900 dark:text-white">{user.kelas}</strong>
      </div>
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
        <span className="block text-slate-500">Jenis Kelamin</span>
        <strong className="text-slate-900 dark:text-white">
          {user.jk === 'P' ? 'Perempuan (P)' : 'Laki-Laki (L)'}
        </strong>
      </div>
    </div>
  </div>
);
