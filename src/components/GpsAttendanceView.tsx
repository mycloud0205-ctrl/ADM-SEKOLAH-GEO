import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import { formatHariTanggal, getTodayWIB, hitungJarakMeter } from '../shared/scheduleConstants';
import type {
  AuthUser,
  KalenderRecord,
  KehadiranPegawaiRecord,
  KehadiranSiswaRecord,
  PengaturanSekolah,
} from '../shared/types';

interface GpsAttendanceViewProps {
  user: AuthUser;
  pengaturan: PengaturanSekolah;
  kalenderHariIni: KalenderRecord;
  kehadiranSiswa: KehadiranSiswaRecord[];
  kehadiranPegawai: KehadiranPegawaiRecord[];
  onRefresh: () => Promise<void>;
}

export const GpsAttendanceView: React.FC<GpsAttendanceViewProps> = ({
  user,
  pengaturan,
  kalenderHariIni,
  kehadiranSiswa,
  kehadiranPegawai,
  onRefresh,
}) => {
  const [liveClock, setLiveClock] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ready' | 'out_of_range' | 'error'>('loading');
  const [gpsMsg, setGpsMsg] = useState('Mendeteksi lokasi GPS...');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const todayStr = getTodayWIB();

  const existingRecord =
    user.role === 'siswa'
      ? kehadiranSiswa.find(
          (h) => h.tglAbsen === todayStr && h.nis.toLowerCase() === user.nisNip.toLowerCase()
        )
      : kehadiranPegawai.find(
          (p) =>
            p.tglAbsen === todayStr &&
            (p.nipUser.toLowerCase() === user.nisNip.toLowerCase() ||
              p.nipUser.toLowerCase() === user.username.toLowerCase() ||
              p.nama.toLowerCase() === user.nama.toLowerCase())
        );

  const alreadyCheckedIn = Boolean(existingRecord);

  useEffect(() => {
    const tick = () => {
      const nowStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
      setLiveClock(`${nowStr} WIB`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const detectLocation = useCallback(() => {
    if (kalenderHariIni.modeKbm.toLowerCase() === 'daring') {
      setGpsStatus('ready');
      setGpsMsg('Mode KBM Daring aktif. Presensi tidak dibatasi radius GPS.');
      return;
    }
    if (
      kalenderHariIni.modeKbm.toLowerCase() === 'libur' ||
      kalenderHariIni.statusEfektif.toLowerCase() === 'tidak efektif'
    ) {
      setGpsStatus('error');
      setGpsMsg(kalenderHariIni.keterangan || 'Hari ini bukan hari efektif KBM.');
      return;
    }

    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsMsg('Browser Anda tidak mendukung fitur geolokasi.');
      return;
    }

    setGpsStatus('loading');
    setGpsMsg('Menghitung jarak lokasi Anda ke sekolah...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        setLat(uLat);
        setLng(uLng);
        const dist = Math.round(hitungJarakMeter(uLat, uLng, pengaturan.latGps, pengaturan.lngGps));
        setDistanceMeters(dist);
        if (dist <= pengaturan.radiusMeter) {
          setGpsStatus('ready');
          setGpsMsg(`Anda berada di dalam radius sekolah (${dist} meter).`);
        } else {
          setGpsStatus('out_of_range');
          setGpsMsg(`Lokasi Anda berjarak ${dist} meter (Maksimal ${pengaturan.radiusMeter} meter).`);
        }
      },
      () => {
        setGpsStatus('error');
        setGpsMsg('Gagal mengakses GPS. Pastikan izin lokasi browser diaktifkan.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [kalenderHariIni, pengaturan]);

  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  const handleSubmitPresensi = async () => {
    // STRICT GUARD: Jika Guru/User sudah absen GPS hari ini, tombol tidak berfungsi
    if (alreadyCheckedIn || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiRequest<{ status: boolean; message: string }>('/api/presensi/gps', {
        method: 'POST',
        body: JSON.stringify({ userLat: lat, userLng: lng }),
      });
      setFeedback({ type: res.status ? 'success' : 'error', text: res.message });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan presensi.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isHoliday =
    kalenderHariIni.modeKbm.toLowerCase() === 'libur' ||
    kalenderHariIni.statusEfektif.toLowerCase() === 'tidak efektif';

  const buttonDisabled =
    alreadyCheckedIn ||
    submitting ||
    isHoliday ||
    (kalenderHariIni.modeKbm.toLowerCase() === 'luring' && gpsStatus !== 'ready');

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-3xl p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <MapPin className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            Presensi Kehadiran Mandiri (GPS)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {user.nama} · {pengaturan.namaSekolah} (Radius Max {pengaturan.radiusMeter} meter)
          </p>
        </div>

        {/* Jam & Tanggal Server */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">Tanggal Hari Ini</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {formatHariTanggal(todayStr)}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <Clock className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">Waktu WIB</span>
              <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {liveClock || '--:--:-- WIB'}
              </span>
            </div>
          </div>
        </div>

        {/* Status GPS */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600 dark:text-slate-400">
              Mode: {kalenderHariIni.modeKbm} ({kalenderHariIni.jamMulai} - {kalenderHariIni.jamSelesai} WIB)
            </span>
            {distanceMeters !== null && (
              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                {distanceMeters} m
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            {gpsStatus === 'ready' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span className="text-slate-700 dark:text-slate-300">{gpsMsg}</span>
          </div>

          {!alreadyCheckedIn && (
            <button
              type="button"
              onClick={detectLocation}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Segarkan Lokasi GPS</span>
            </button>
          )}
        </div>

        {/* Kunci Presensi jika sudah Absen GPS hari ini */}
        {alreadyCheckedIn && existingRecord && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Presensi Hari Ini Sudah Tercatat &amp; Terkunci</span>
            </div>
            <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
              Anda tercatat <strong>{existingRecord.status}</strong> pada{' '}
              <span className="font-mono font-bold">{existingRecord.waktuInput} WIB</span> (
              {existingRecord.jarakMeter}). Tombol presensi dinonaktifkan agar jam masuk tidak berubah.
            </p>
          </div>
        )}

        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-700 dark:text-rose-300'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Tombol Presensi GPS (Nonaktif total jika sudah presensi hari ini) */}
        <button
          type="button"
          onClick={handleSubmitPresensi}
          disabled={buttonDisabled}
          className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
            alreadyCheckedIn
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-45 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-500/20'
          }`}
        >
          {alreadyCheckedIn ? (
            <>
              <Lock className="w-4 h-4" />
              <span>Sudah Absen Hari Ini (Tombol Terkunci)</span>
            </>
          ) : isHoliday ? (
            <span>Presensi Ditutup (Hari Libur)</span>
          ) : submitting ? (
            <span>Menyimpan Presensi...</span>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {kalenderHariIni.modeKbm.toLowerCase() === 'daring'
                  ? 'Kirim Presensi Daring Sekarang'
                  : 'Kirim Presensi GPS Sekarang'}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
