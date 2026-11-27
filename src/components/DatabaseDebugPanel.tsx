import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { apiRequest } from '../utils/api';

interface DbDebugResponse {
  status: boolean;
  checkedAt: string;
  envFileExists: boolean;
  sqlite: {
    ok: boolean;
    file: string;
    counts: {
      siswa: number;
      users: number;
      jadwal_pelajaran: number;
      jurnal_harian: number;
      kehadiran_siswa: number;
      kehadiran_pegawai: number;
      pengumpulan_tugas: number;
      pembinaan_siswa: number;
      kalender_pendidikan: number;
      agenda_akademik: number;
      data_jurusan: number;
      master_mapel: number;
    };
  };
  mysql: {
    ok: boolean;
    configured: boolean;
    host: string;
    port: number;
    database: string;
    user: string;
    hostType: 'infinityfree' | 'localhost' | 'remote' | 'unconfigured';
    sslActive: boolean;
    serverVersion: string;
    tableCount: number;
    latencyMs: number;
    errorCode: string;
    message: string;
  };
  supabase: {
    configured: boolean;
  };
}

export const DatabaseDebugPanel: React.FC<{ liveTick?: number }> = ({ liveTick = 0 }) => {
  const [data, setData] = useState<DbDebugResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDebug = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<DbDebugResponse>('/api/admin/db-debug');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat diagnostik database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDebug();
  }, [fetchDebug, liveTick]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void fetchDebug();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchDebug]);

  const mysql = data?.mysql;
  const sqlite = data?.sqlite;
  const totalSqliteRecords = sqlite
    ? Object.values(sqlite.counts).reduce((sum, n) => sum + Number(n || 0), 0)
    : 0;

  const hostTypeLabel =
    mysql?.hostType === 'infinityfree'
      ? 'InfinityFree Shared Host'
      : mysql?.hostType === 'localhost'
        ? 'Localhost (Server Lokal)'
        : mysql?.hostType === 'remote'
          ? 'Remote MySQL Host'
          : 'Belum Diatur';

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header & Real-time Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Debug Koneksi Database Real-Time
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>Pemantauan langsung SQLite lokal, MySQL online, dan Supabase</span>
              {data?.checkedAt && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                  <Clock className="w-3 h-3" />
                  Diperiksa: {data.checkedAt}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-indigo-600"
            />
            <span>Auto-Refresh (15 dtk)</span>
          </label>
          <button
            type="button"
            onClick={() => void fetchDebug()}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Memeriksa...' : 'Periksa Sekarang'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3-Layer Database Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: SQLite Lokal */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">SQLite Lokal (Utama)</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Aktif
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/70">
              <span className="block text-slate-500">Berkas DB</span>
              <strong className="font-mono text-slate-800 dark:text-slate-100">{sqlite?.file || 'data/school.db'}</strong>
            </div>
            <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/70">
              <span className="block text-slate-500">Total Baris Data</span>
              <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                {totalSqliteRecords.toLocaleString('id-ID')}
              </strong>
            </div>
          </div>

          {sqlite && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200 dark:border-slate-700/80">
              <div className="flex justify-between">
                <span>Siswa</span>
                <strong className="font-mono tabular-nums">{sqlite.counts.siswa}</strong>
              </div>
              <div className="flex justify-between">
                <span>Pengguna</span>
                <strong className="font-mono tabular-nums">{sqlite.counts.users}</strong>
              </div>
              <div className="flex justify-between">
                <span>Jadwal</span>
                <strong className="font-mono tabular-nums">{sqlite.counts.jadwal_pelajaran}</strong>
              </div>
              <div className="flex justify-between">
                <span>Jurnal</span>
                <strong className="font-mono tabular-nums">{sqlite.counts.jurnal_harian}</strong>
              </div>
              <div className="flex justify-between">
                <span>Absen Siswa</span>
                <strong className="font-mono tabular-nums">{sqlite.counts.kehadiran_siswa}</strong>
              </div>
              <div className="flex justify-between">
                <span>Absen Pegawai</span>
                <strong className="font-mono tabular-nums">{sqlite.counts.kehadiran_pegawai}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: MySQL Online */}
        <div
          className={`lg:col-span-2 p-4 rounded-xl border space-y-3 ${
            mysql?.ok
              ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80'
              : mysql?.configured
                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/80'
                : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server
                className={`w-4 h-4 ${
                  mysql?.ok
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : mysql?.configured
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400'
                }`}
              />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                MySQL Online ({hostTypeLabel})
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-bold">
              {mysql && (
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  {mysql.latencyMs} ms · Kode: {mysql.errorCode}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 ${
                  mysql?.ok
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : mysql?.configured
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {mysql?.ok ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {mysql?.ok ? 'Terhubung' : mysql?.configured ? 'Gagal Terhubung' : 'Belum Dikonfigurasi'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/70">
              <span className="block text-slate-500">Host &amp; Port</span>
              <strong className="font-mono text-slate-900 dark:text-white break-all">
                {mysql?.host ? `${mysql.host}:${mysql.port}` : '-'}
              </strong>
            </div>
            <div className="p-2 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/70">
              <span className="block text-slate-500">Database</span>
              <strong className="font-mono text-slate-900 dark:text-white break-all">
                {mysql?.database || '-'}
              </strong>
            </div>
            <div className="p-2 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/70">
              <span className="block text-slate-500">Username DB</span>
              <strong className="font-mono text-slate-900 dark:text-white break-all">
                {mysql?.user || '-'}
              </strong>
            </div>
            <div className="p-2 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/70">
              <span className="block text-slate-500">Versi / Tabel / SSL</span>
              <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                {mysql?.ok
                  ? `${mysql.serverVersion} · ${mysql.tableCount} tbl`
                  : `SSL: ${mysql?.sslActive ? 'Ya' : 'Tidak'}`}
              </strong>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-700 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            <span className="font-bold text-slate-900 dark:text-white">Hasil Diagnostik: </span>
            {mysql ? mysql.message : 'Memeriksa koneksi database...'}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Database className="w-3.5 h-3.5" />
              Supabase Cloud:{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {data?.supabase.configured ? 'Terhubung (Aktif)' : 'Opsional (Tidak Diaktifkan)'}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              File <code className="font-mono">.env</code> lokal:{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {data?.envFileExists ? 'Tersedia di server' : 'Tidak ditemukan'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Special Context Alert when InfinityFree or Localhost fails from cloud runtime */}
      {mysql && !mysql.ok && (mysql.hostType === 'infinityfree' || mysql.hostType === 'localhost') && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
          <div className="flex items-center gap-2 font-bold">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              {mysql.hostType === 'infinityfree'
                ? 'Terdeteksi Host InfinityFree (Akses Remote Port 3306 Dibatasi)'
                : 'Terdeteksi Host "localhost" di Lingkungan Server Node.js'}
            </span>
          </div>
          <p className="leading-relaxed">
            {mysql.hostType === 'infinityfree'
              ? 'Server MySQL InfinityFree (seperti sql110.infinityfree.com) tidak mengizinkan koneksi langsung dari luar jaringan InfinityFree. Jika Anda mengubah konfigurasi di .env namun host di atas masih menunjukkan InfinityFree, periksa apakah variabel MYSQL_HOST masih tertinggal di Secrets AI Studio.'
              : 'Host "localhost" mengarah ke server tempat aplikasi Node.js berjalan. Saat aplikasi ini di-deploy di server cPanel/VPS yang sama dengan database MySQL Anda, koneksi localhost akan terhubung otomatis. Namun di pratinjau cloud ini tidak ada server MySQL lokal — untuk mengetes koneksi langsung ke database cPanel dari pratinjau ini, isi MYSQL_HOST dengan IP/domain server hosting Anda dan tambahkan tanda "%" di menu Remote MySQL® cPanel.'}
          </p>
        </div>
      )}

    </div>
  );
};
