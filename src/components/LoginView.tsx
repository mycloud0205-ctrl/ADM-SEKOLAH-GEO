import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import type { AuthUser, PengaturanSekolah } from '../shared/types';

interface LoginViewProps {
  pengaturan: PengaturanSekolah;
  adminClaimed: boolean;
  metaError?: string | null;
  authNotice?: string | null;
  onLoginSuccess: (token: string, user: AuthUser) => void;
  onEndpointUpdated?: () => Promise<void>;
}

export const LoginView: React.FC<LoginViewProps> = ({
  pengaturan,
  adminClaimed,
  metaError,
  authNotice,
  onLoginSuccess,
  onEndpointUpdated,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [claimAdminPass, setClaimAdminPass] = useState('');
  const [claimStaffPass, setClaimStaffPass] = useState('');
  const [showClaimAdminPass, setShowClaimAdminPass] = useState(false);
  const [showLoginOverride, setShowLoginOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!username.trim()) {
      setErrorMsg('Masukkan NIS (Siswa) atau Username (Admin / Guru / Karyawan).');
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ status: boolean; token: string; user: AuthUser; message?: string }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), password }),
        }
      );
      if (res.status && res.token && res.user) {
        onLoginSuccess(res.token, res.user);
      } else {
        setErrorMsg(res.message || 'Identitas tidak valid.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (claimAdminPass.trim().length < 6) {
      setErrorMsg('Password Admin minimal 6 karakter.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ status: boolean; token: string; user: AuthUser; message?: string }>(
        '/api/auth/claim-admin',
        {
          method: 'POST',
          body: JSON.stringify({
            adminPassword: claimAdminPass.trim(),
            staffPassword: claimStaffPass.trim(),
          }),
        }
      );
      if (res.status && res.token && res.user) {
        onLoginSuccess(res.token, res.user);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal aktivasi admin.');
    } finally {
      setLoading(false);
    }
  };

  const showClaimForm = !adminClaimed && !showLoginOverride;
  const activeAlert = errorMsg || metaError || authNotice;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-slate-100 via-indigo-50/70 to-sky-100 dark:from-slate-950 dark:via-indigo-950/60 dark:to-slate-900">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-5 rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xl">
        {/* Left Branding Panel */}
        <div className="lg:col-span-2 p-8 flex flex-col justify-between bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-700 text-white">
          <div className="space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center overflow-hidden p-1.5">
              {pengaturan.logoSekolah ? (
                <img
                  src={pengaturan.logoSekolah}
                  alt={pengaturan.namaSekolah}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <GraduationCap className="w-9 h-9 text-white" />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-indigo-100 tracking-wide">
                Sistem Integrasi Sekolah
              </p>
              <h1 className="text-2xl font-extrabold leading-tight text-balance">
                {pengaturan.namaSekolah}
              </h1>
              <p className="text-xs text-indigo-100/90 leading-relaxed">
                {pengaturan.alamatSekolah}
              </p>
            </div>
          </div>

          <div className="pt-8 space-y-2 text-xs text-indigo-100/90 border-t border-white/15 mt-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-300" />
              <span>Monitoring KBM & Kehadiran Guru Real-Time</span>
            </div>
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 shrink-0 text-sky-300" />
              <span>Presensi GPS, Jurnal Harian, BK & Tugas Digital</span>
            </div>
            <div className="pt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-[11px] font-semibold text-emerald-100">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Database: Firebase Firestore (solar-phantasmata-007pf)</span>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="lg:col-span-3 p-6 sm:p-10 flex flex-col justify-center space-y-5">
          {showClaimForm ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-bold mb-1">
                    <KeyRound className="w-4 h-4" />
                    <span>Aktivasi Awal Administrator</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Atur Kata Sandi Admin Sekolah
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Sebelum menggunakan aplikasi, tentukan kata sandi untuk akun <strong>admin</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setShowLoginOverride(true);
                  }}
                  className="shrink-0 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Login Siswa / Guru →
                </button>
              </div>

              {activeAlert && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{activeAlert}</span>
                </div>
              )}

              <form onSubmit={handleClaimAdmin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password Baru Admin (Username: admin)
                  </label>
                  <div className="relative">
                    <input
                      type={showClaimAdminPass ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={claimAdminPass}
                      onChange={(e) => setClaimAdminPass(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowClaimAdminPass((v) => !v)}
                      aria-label={showClaimAdminPass ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showClaimAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password Baru Akun Guru &amp; Karyawan (Opsional)
                  </label>
                  <input
                    type={showClaimAdminPass ? 'text' : 'password'}
                    value={claimStaffPass}
                    onChange={(e) => setClaimStaffPass(e.target.value)}
                    placeholder="Kosongkan untuk pakai bawaan (guru123 / karyawan123)"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition"
                >
                  <span>{loading ? 'Mengaktifkan...' : 'Aktifkan & Masuk sebagai Admin'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Masuk ke Portal Sekolah
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Siswa masuk menggunakan NIS (tanpa password). Admin, Guru, dan Karyawan menggunakan Username &amp; Password.
                  </p>
                </div>
                {!adminClaimed && showLoginOverride && (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setShowLoginOverride(false);
                    }}
                    className="shrink-0 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    ← Aktivasi Admin
                  </button>
                )}
              </div>

              {activeAlert && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{activeAlert}</span>
                  </div>
                  {metaError && (
                    <div>
                      <button
                        type="button"
                        onClick={() => void onEndpointUpdated?.()}
                        className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold"
                      >
                        Coba Hubungkan Ulang
                      </button>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    NIS (Siswa) / Username (Staf)
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Contoh: 262710286 (Siswa) atau guru / admin"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password (Kosongkan jika Siswa)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi"
                      className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition"
                >
                  <span>{loading ? 'Memverifikasi...' : 'Masuk Aplikasi'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
