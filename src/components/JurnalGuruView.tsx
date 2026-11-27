import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  Save,
  Users,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import {
  formatHariTanggal,
  getNamaHariWIB,
  getTodayWIB,
  parseJamKeRangeFromJadwal,
} from '../shared/scheduleConstants';
import type {
  AttendanceStatus,
  AuthUser,
  JadwalRecord,
  JurnalRecord,
  KehadiranSiswaRecord,
  SiswaRecord,
} from '../shared/types';
import { AttendanceStatusButtons, normalizeAttendanceStatus } from './AttendanceStatusButtons';

interface JurnalGuruViewProps {
  user: AuthUser;
  todayStr?: string;
  jadwal: JadwalRecord[];
  jurnal: JurnalRecord[];
  siswa: SiswaRecord[];
  kehadiran: KehadiranSiswaRecord[];
  mapelList: string[];
  prefillJadwal: JadwalRecord | null;
  onClearPrefill: () => void;
  onGoToJadwal?: () => void;
  onRefresh: () => Promise<void>;
}

export const JurnalGuruView: React.FC<JurnalGuruViewProps> = ({
  user,
  todayStr,
  jadwal,
  jurnal,
  siswa,
  kehadiran,
  mapelList,
  prefillJadwal,
  onClearPrefill,
  onGoToJadwal,
  onRefresh,
}) => {
  const isAdmin = user.role === 'admin';
  const effectiveToday = todayStr || getTodayWIB();
  const prevTodayRef = useRef(effectiveToday);
  const [tanggal, setTanggal] = useState(effectiveToday);
  const [selectedJadwalId, setSelectedJadwalId] = useState<number | null>(null);
  const [kelas, setKelas] = useState('');
  const [jamKe, setJamKe] = useState('');
  const [mapel, setMapel] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [materi, setMateri] = useState('');
  const [metode, setMetode] = useState('');
  const [refleksi, setRefleksi] = useState('');
  const [tugas, setTugas] = useState('');
  const [nilaiProgres, setNilaiProgres] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [simpanAbsenBersama, setSimpanAbsenBersama] = useState(true);
  const [absenMap, setAbsenMap] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const kelasOptions = useMemo(() => {
    const set = new Set([...siswa.map((s) => s.kelas), ...jadwal.map((j) => j.kelas)].filter(Boolean));
    return Array.from(set).sort();
  }, [siswa, jadwal]);

  const namaHari = getNamaHariWIB(tanggal);

  const jadwalHariIni = useMemo(() => {
    return jadwal.filter((j) => {
      const matchHari = j.hari.toLowerCase() === namaHari.toLowerCase();
      if (isAdmin) return matchHari;
      return matchHari && j.guru.toLowerCase() === user.nama.toLowerCase();
    });
  }, [jadwal, namaHari, user, isAdmin]);

  const siswaKelas = useMemo(() => {
    if (!kelas) return [];
    return siswa.filter((s) => s.kelas === kelas);
  }, [siswa, kelas]);

  const targetDate = String(tanggal || '').slice(0, 10);

  // Auto-rollover tanggal & reset status ke default Hadir saat berganti hari (00:00 WIB)
  useEffect(() => {
    if (prevTodayRef.current !== effectiveToday) {
      prevTodayRef.current = effectiveToday;
      setTanggal(effectiveToday);
      setMessage(null);
      setAbsenMap((prev) => {
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

  // Populate attendance defaults when class or date changes — histori hari lain tidak pernah terbawa
  useEffect(() => {
    if (!kelas) {
      setAbsenMap({});
      return;
    }
    const next: Record<string, AttendanceStatus> = {};
    for (const s of siswaKelas) {
      const existing = kehadiran.find(
        (k) => String(k.tglAbsen || '').slice(0, 10) === targetDate && k.nis === s.nis
      );
      next[s.nis] = existing ? normalizeAttendanceStatus(existing.status) : 'Hadir';
    }
    setAbsenMap(next);
  }, [kelas, targetDate, siswaKelas, kehadiran]);

  const handleTanggalChange = (newTanggal: string) => {
    setTanggal(newTanggal);
    setMessage(null);
    if (siswaKelas.length > 0) {
      const freshDefault: Record<string, AttendanceStatus> = {};
      for (const s of siswaKelas) {
        freshDefault[s.nis] = 'Hadir';
      }
      setAbsenMap(freshDefault);
    }
  };

  const handleResetAllHadir = () => {
    const freshDefault: Record<string, AttendanceStatus> = {};
    for (const s of siswaKelas) {
      freshDefault[s.nis] = 'Hadir';
    }
    setAbsenMap(freshDefault);
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      const freshDefault: Record<string, AttendanceStatus> = {};
      for (const s of siswaKelas) {
        const existing = kehadiran.find(
          (k) => String(k.tglAbsen || '').slice(0, 10) === targetDate && k.nis === s.nis
        );
        freshDefault[s.nis] = existing ? normalizeAttendanceStatus(existing.status) : 'Hadir';
      }
      setAbsenMap(freshDefault);
    } finally {
      setRefreshing(false);
    }
  };

  const statusSummary = useMemo(() => {
    const counts = { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0, Terlambat: 0 };
    for (const s of siswaKelas) {
      const st = absenMap[s.nis] || 'Hadir';
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [siswaKelas, absenMap]);

  // Handle prefill from Dashboard
  useEffect(() => {
    if (prefillJadwal) {
      const range = parseJamKeRangeFromJadwal(prefillJadwal.jam);
      setSelectedJadwalId(prefillJadwal.id);
      setKelas(prefillJadwal.kelas);
      setJamKe(range.label || prefillJadwal.jam);
      setMapel(prefillJadwal.mapel);
      onClearPrefill();
    }
  }, [prefillJadwal, onClearPrefill]);

  // Ensure selected schedule stays valid when date changes for Guru
  useEffect(() => {
    if (!isAdmin && selectedJadwalId !== null) {
      const stillExists = jadwalHariIni.some((j) => j.id === selectedJadwalId);
      if (!stillExists) {
        setSelectedJadwalId(null);
        setKelas('');
        setJamKe('');
        setMapel('');
      }
    }
  }, [isAdmin, jadwalHariIni, selectedJadwalId]);

  const handleSelectScheduleCard = (item: JadwalRecord) => {
    const range = parseJamKeRangeFromJadwal(item.jam);
    setSelectedJadwalId(item.id);
    setKelas(item.kelas);
    setJamKe(range.label || item.jam);
    setMapel(item.mapel);
  };

  const handleKelasChange = (newKelas: string) => {
    setKelas(newKelas);
    const matched = jadwalHariIni.find((j) => j.kelas === newKelas);
    if (matched) {
      const range = parseJamKeRangeFromJadwal(matched.jam);
      setSelectedJadwalId(matched.id);
      setJamKe(range.label || matched.jam);
      setMapel(matched.mapel);
    }
  };

  const guruNeedsSchedule = !isAdmin && selectedJadwalId === null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guruNeedsSchedule) {
      setMessage({
        type: 'error',
        text: 'Pilih jadwal mengajar Anda terlebih dahulu. Jika belum tersedia, buat jadwal di Master Kelola Jadwal Mengajar Guru.',
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const absensiBatch =
        simpanAbsenBersama && siswaKelas.length > 0
          ? siswaKelas.map((s) => ({
              nis: s.nis,
              nama: s.nama,
              kelas: s.kelas,
              jurusan: s.jurusan,
              jk: s.jk,
              status: absenMap[s.nis] || 'Hadir',
            }))
          : [];

      const res = await apiRequest<{ status: boolean; message: string }>('/api/jurnal', {
        method: 'POST',
        body: JSON.stringify({
          tanggal,
          jamKe,
          kelas,
          mapel,
          tujuan,
          materi,
          metode,
          refleksi,
          tugas,
          nilaiProgres,
          fotoUrl,
          absensiBatch,
        }),
      });

      setMessage({ type: 'success', text: res.message });
      setMateri('');
      setTujuan('');
      setMetode('');
      setRefleksi('');
      setTugas('');
      setNilaiProgres('');
      setFotoUrl('');
      await onRefresh();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan jurnal.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Jadwal Guru Hari Ini (Wajib Isi Jurnal KBM) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Jadwal Mengajar ({namaHari}, {formatHariTanggal(tanggal)})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pilih jadwal di bawah untuk mengisi Form Jurnal Harian &amp; Absensi Kelas secara otomatis.
            </p>
          </div>
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {jadwalHariIni.length} Jadwal Terdaftar
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {jadwalHariIni.length === 0 ? (
            <div className="col-span-full p-4 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">
                    Belum ada jadwal mengajar pada hari {namaHari}.
                  </p>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {isAdmin
                      ? 'Sebagai Admin Anda tetap dapat mengisi jurnal secara manual atau menambahkan jadwal terlebih dahulu.'
                      : 'Guru wajib melakukan penjadwalan di menu Kelola Jadwal Mengajar Guru terlebih dahulu sebelum mengisi Jurnal Harian Pembelajaran.'}
                  </p>
                </div>
              </div>
              {onGoToJadwal && (
                <button
                  type="button"
                  onClick={onGoToJadwal}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold whitespace-nowrap transition"
                >
                  Buka Kelola Jadwal Mengajar
                </button>
              )}
            </div>
          ) : (
            jadwalHariIni.map((item) => {
              const itemRange = parseJamKeRangeFromJadwal(item.jam);
              const sudahIsi = jurnal.some((jr) => {
                if (
                  jr.tanggal !== tanggal ||
                  jr.kelas !== item.kelas ||
                  jr.mapel.toLowerCase() !== item.mapel.toLowerCase()
                ) {
                  return false;
                }
                const jrRange = parseJamKeRangeFromJadwal(jr.jamKe);
                if (itemRange.start !== null && itemRange.end !== null && jrRange.start !== null && jrRange.end !== null) {
                  return jrRange.start <= itemRange.end && jrRange.end >= itemRange.start;
                }
                return true;
              });
              const isSelected = selectedJadwalId === item.id || (kelas === item.kelas && mapel === item.mapel);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectScheduleCard(item)}
                  className={`p-3.5 rounded-xl border text-left transition space-y-1.5 ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-slate-500 dark:text-slate-400">{item.jam}</span>
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        sudahIsi
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {sudahIsi ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {sudahIsi ? 'Sudah Diisi' : 'Wajib Isi'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {item.kelas} · {item.mapel}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Guru: {item.guru} · Ruang {item.ruang || '-'}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Form Jurnal KBM + Absensi Siswa Kelas */}
      <form
        onSubmit={handleSubmit}
        className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Form Jurnal Harian Pembelajaran Guru
          </h3>
        </div>

        {message && (
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold border ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-700 dark:text-rose-300'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tanggal KBM *
            </label>
            <input
              type="date"
              required
              value={tanggal}
              onChange={(e) => handleTanggalChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Pilih Kelas (Otomatis Tampilkan Siswa) *
            </label>
            <select
              required
              disabled={!isAdmin}
              value={kelas}
              onChange={(e) => handleKelasChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-75"
            >
              <option value="">{isAdmin ? '-- Pilih Kelas --' : '-- Klik Kartu Jadwal di Atas --'}</option>
              {kelasOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Jam Ke- (Sesuai Jadwal Guru) *
            </label>
            <input
              type="text"
              required
              readOnly={!isAdmin}
              value={jamKe}
              onChange={(e) => setJamKe(e.target.value)}
              placeholder="Otomatis dari jadwal mengajar"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white read-only:opacity-80"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Mata Pelajaran *
            </label>
            <select
              required
              disabled={!isAdmin}
              value={mapel}
              onChange={(e) => setMapel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white disabled:opacity-75"
            >
              <option value="">{isAdmin ? '-- Pilih Mata Pelajaran --' : '-- Otomatis dari Jadwal --'}</option>
              {mapelList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tujuan Pembelajaran
            </label>
            <textarea
              rows={2}
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder="Tuliskan tujuan pembelajaran..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Topik / Materi Pembelajaran *
            </label>
            <textarea
              rows={2}
              required
              value={materi}
              onChange={(e) => setMateri(e.target.value)}
              placeholder="Tuliskan topik/materi yang diajarkan..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            value={metode}
            onChange={(e) => setMetode(e.target.value)}
            placeholder="Metode Pembelajaran"
            className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          />
          <input
            type="text"
            value={refleksi}
            onChange={(e) => setRefleksi(e.target.value)}
            placeholder="Refleksi KBM"
            className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          />
          <input
            type="text"
            value={tugas}
            onChange={(e) => setTugas(e.target.value)}
            placeholder="Tugas Harian"
            className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          />
          <input
            type="text"
            value={nilaiProgres}
            onChange={(e) => setNilaiProgres(e.target.value)}
            placeholder="Progres Capaian"
            className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
          />
        </div>

        <input
          type="url"
          value={fotoUrl}
          onChange={(e) => setFotoUrl(e.target.value)}
          placeholder="Link Dokumentasi Foto KBM (Opsional)"
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
        />

        {/* Daftar Siswa Kelas Saat KBM */}
        {kelas && (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Absensi Siswa Kelas {kelas} ({siswaKelas.length} Siswa)
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        hasSavedAttendanceForDate
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
                      }`}
                    >
                      {hasSavedAttendanceForDate
                        ? `Tersimpan (${formatHariTanggal(tanggal)})`
                        : 'Default HADIR (Hari Baru)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Hadir: <b className="text-emerald-600">{statusSummary.Hadir}</b> · Ijin:{' '}
                    <b className="text-blue-600">{statusSummary.Izin}</b> · Sakit:{' '}
                    <b className="text-yellow-600">{statusSummary.Sakit}</b> · Alpha:{' '}
                    <b className="text-red-600">{statusSummary.Alpa}</b> · Terlambat:{' '}
                    <b className="text-orange-600">{statusSummary.Terlambat}</b>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshStatus}
                  disabled={refreshing}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>Refresh Status</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAllHadir}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Default Semua Hadir</span>
                </button>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer ml-1">
                  <input
                    type="checkbox"
                    checked={simpanAbsenBersama}
                    onChange={(e) => setSimpanAbsenBersama(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                  <span>Simpan Absensi Kelas Bersamaan</span>
                </label>
              </div>
            </div>

            {siswaKelas.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">
                Belum ada data siswa terdaftar di kelas {kelas}.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-80 custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                      <th className="p-2.5 w-10">No</th>
                      <th className="p-2.5">NIS</th>
                      <th className="p-2.5">Nama Siswa</th>
                      <th className="p-2.5 w-12">JK</th>
                      <th className="p-2.5 text-center min-w-[300px]">Status Kehadiran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
                    {siswaKelas.map((s, idx) => (
                      <tr key={s.nis} className="hover:bg-white dark:hover:bg-slate-900/50">
                        <td className="p-2.5 tabular-nums">{idx + 1}</td>
                        <td className="p-2.5 font-mono text-indigo-600 dark:text-indigo-400">{s.nis}</td>
                        <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{s.nama}</td>
                        <td className="p-2.5">{s.jk}</td>
                        <td className="p-2.5 text-center">
                          <AttendanceStatusButtons
                            value={absenMap[s.nis] || 'Hadir'}
                            onChange={(nextStatus) =>
                              setAbsenMap((prev) => ({
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
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || guruNeedsSchedule}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transition"
          >
            <Save className="w-4 h-4" />
            <span>
              {saving
                ? 'Menyimpan...'
                : guruNeedsSchedule
                ? 'Pilih Jadwal Mengajar Terlebih Dahulu'
                : 'Simpan Jurnal & Perbarui Dashboard KBM'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
