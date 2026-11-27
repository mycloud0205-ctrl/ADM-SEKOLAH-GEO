import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  CloudUpload,
  ShieldAlert,
  UserCheck,
  Users,
} from 'lucide-react';
import { formatHariTanggal, getNamaHariWIB, getTodayWIB } from '../shared/scheduleConstants';
import type {
  AgendaRecord,
  AuthUser,
  JadwalRecord,
  JurnalRecord,
  KalenderRecord,
  KehadiranPegawaiRecord,
  KehadiranSiswaRecord,
  PembinaanRecord,
  SiswaRecord,
} from '../shared/types';
import { AttendanceTrendChart } from './AttendanceTrendChart';

interface DashboardHomeProps {
  user: AuthUser;
  todayStr?: string;
  kalenderHariIni: KalenderRecord;
  siswa: SiswaRecord[];
  kehadiran: KehadiranSiswaRecord[];
  kehadiranPegawai: KehadiranPegawaiRecord[];
  pembinaan: PembinaanRecord[];
  jadwal: JadwalRecord[];
  jurnal: JurnalRecord[];
  agenda: AgendaRecord[];
  totalPegawai?: number;
  onSwitchTab: (tab: string) => void;
  onSelectJadwalForJurnal: (jadwal: JadwalRecord) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  user,
  todayStr: todayStrProp,
  kalenderHariIni,
  siswa,
  kehadiran,
  kehadiranPegawai,
  pembinaan,
  jadwal,
  jurnal,
  agenda,
  totalPegawai = 4,
  onSwitchTab,
  onSelectJadwalForJurnal,
}) => {
  const todayStr = todayStrProp || getTodayWIB();
  const todayHari = getNamaHariWIB(todayStr);

  const siswaHadirToday = kehadiran.filter(
    (h) => h.tglAbsen === todayStr && (h.status === 'Hadir' || h.status === 'Terlambat')
  ).length;
  const pegawaiHadirToday = kehadiranPegawai.filter(
    (h) => h.tglAbsen === todayStr && (h.status === 'Hadir' || h.status === 'Terlambat')
  ).length;

  const jadwalGuruToday = jadwal.filter(
    (j) =>
      j.hari.toLowerCase() === todayHari.toLowerCase() &&
      j.guru.toLowerCase() === user.nama.toLowerCase()
  );

  return (
    <div className="space-y-6">
      {/* Kalender Pendidikan Hari Ini */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 text-white shadow-lg shadow-indigo-500/15 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            <CalendarCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-indigo-100">Status Kalender Sekolah Hari Ini</p>
            <h2 className="text-lg font-bold mt-0.5">{formatHariTanggal(kalenderHariIni?.tanggal || todayStr)}</h2>
            <p className="text-xs text-indigo-100/90 mt-1">{kalenderHariIni?.keterangan || '-'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="px-3.5 py-1.5 rounded-xl bg-white/15 border border-white/25">
            Mode: {kalenderHariIni?.modeKbm || 'Luring'} ({kalenderHariIni?.statusEfektif || 'Efektif'})
          </span>
          <span className="px-3.5 py-1.5 rounded-xl bg-slate-950/30 font-mono tabular-nums">
            {kalenderHariIni?.jamMulai && kalenderHariIni.jamMulai !== '-'
              ? `${kalenderHariIni.jamMulai} - ${kalenderHariIni.jamSelesai} WIB`
              : 'Libur'}
          </span>
        </div>
      </div>

      {/* Role: Guru View */}
      {user.role === 'guru' && (
        <div className="space-y-4">
          <div className="rounded-2xl p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Selamat Datang, {user.nama}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Jadwal Mengajar Anda Hari Ini ({todayHari}) · Wajib mengisi Jurnal Harian KBM &amp; Absensi Kelas
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSwitchTab('dash-kehadiran-guru')}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold whitespace-nowrap transition"
              >
                Pantau Status Rombel
              </button>
              <button
                type="button"
                onClick={() => onSwitchTab('jurnal')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold whitespace-nowrap shadow-sm transition"
              >
                Buka Form Jurnal KBM
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jadwalGuruToday.length === 0 ? (
              <div className="col-span-full p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                Tidak ada jadwal mengajar yang terdaftar untuk Anda hari {todayHari}.
              </div>
            ) : (
              jadwalGuruToday.map((item) => {
                const sudahIsi = jurnal.some(
                  (jr) =>
                    jr.tanggal === todayStr &&
                    jr.kelas === item.kelas &&
                    jr.mapel.toLowerCase() === item.mapel.toLowerCase()
                );
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-slate-500 dark:text-slate-400">{item.jam}</span>
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${
                            sudahIsi
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {sudahIsi ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                          {sudahIsi ? 'Jurnal Terisi' : 'Wajib Isi Jurnal'}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.mapel}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Kelas {item.kelas} · Ruang {item.ruang || '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectJadwalForJurnal(item)}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-600 hover:text-white text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    >
                      <span>Isi Jurnal &amp; Absensi Kelas</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Visualisasi Tren Kehadiran Sekolah untuk Guru */}
          <AttendanceTrendChart
            kehadiranSiswa={kehadiran}
            kehadiranPegawai={kehadiranPegawai}
            totalSiswa={siswa.length || 528}
            totalPegawai={totalPegawai || 4}
            title="Tren Kehadiran Sekolah (Siswa & Rekan Guru)"
            subtitle="Pantau dinamika kehadiran siswa dan rekan pengajar secara mingguan maupun bulanan"
          />
        </div>
      )}

      {/* Role: Admin / Karyawan KPIs & Recharts Trend */}
      {(user.role === 'admin' || user.role === 'karyawan') && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
                <span>Total Siswa Terdaftar</span>
                <Users className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2 tabular-nums">
                {siswa.length}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
                <span>Siswa Hadir Hari Ini</span>
                <UserCheck className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
                {siswaHadirToday}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
                <span>Pegawai Hadir Hari Ini</span>
                <ClipboardList className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-2 tabular-nums">
                {pegawaiHadirToday}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
                <span>Catatan Pembinaan BK</span>
                <ShieldAlert className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-2 tabular-nums">
                {pembinaan.length}
              </div>
            </div>
          </div>

          {/* Recharts Comprehensive Attendance Trend Card */}
          <AttendanceTrendChart
            kehadiranSiswa={kehadiran}
            kehadiranPegawai={kehadiranPegawai}
            totalSiswa={siswa.length || 528}
            totalPegawai={totalPegawai || 4}
            title="Tren Kehadiran Siswa & Pegawai"
            subtitle="Visualisasi analitik Recharts tren presensi mingguan, 14 hari, bulanan, dan per semester"
          />
        </div>
      )}

      {/* Role: Siswa Banner & Trend */}
      {user.role === 'siswa' && (
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{user.nama}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                NIS {user.nisNip} · Kelas {user.kelas} · Jurusan {user.jurusan || '-'}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                Nilai SM1: {user.nilaiSm1 || '-'} ({user.statusSm1 || '-'}) · Nilai SM2: {user.nilaiSm2 || '-'} ({user.statusSm2 || '-'})
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSwitchTab('tugas-digital')}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold flex items-center gap-2 whitespace-nowrap shadow-md"
            >
              <CloudUpload className="w-4 h-4" />
              <span>Kumpulkan Tugas Digital</span>
            </button>
          </div>

          <AttendanceTrendChart
            kehadiranSiswa={kehadiran}
            kehadiranPegawai={kehadiranPegawai}
            totalSiswa={siswa.length || 528}
            totalPegawai={totalPegawai || 4}
            title="Statistik Kehadiran Sekolah"
            subtitle="Data pergerakan presensi KBM harian, mingguan, dan bulanan"
          />
        </div>
      )}

      {/* Agenda Akademik */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Agenda Akademik Sekolah</h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Tahun Ajaran Aktif</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agenda.length === 0 ? (
            <p className="text-xs text-slate-500 col-span-full">Belum ada agenda akademik.</p>
          ) : (
            agenda.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5"
              >
                <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                  {formatHariTanggal(a.tanggal)} · {a.kategori}
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{a.judul}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{a.keterangan}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
