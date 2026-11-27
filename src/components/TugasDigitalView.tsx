import React, { useState } from 'react';
import { Award, CheckCircle2, CloudUpload, Download, FileText, Search, X } from 'lucide-react';
import { apiRequest, downloadProtectedFile } from '../utils/api';
import { getTodayWIB } from '../shared/scheduleConstants';
import type { AuthUser, TugasDigitalRecord } from '../shared/types';

interface TugasDigitalViewProps {
  user: AuthUser;
  mapelList: string[];
  historiTugas: TugasDigitalRecord[];
  onRefresh: () => Promise<void>;
}

export const TugasDigitalView: React.FC<TugasDigitalViewProps> = ({
  user,
  mapelList,
  historiTugas,
  onRefresh,
}) => {
  const isAdmin = user.role === 'admin';
  const [subTab, setSubTab] = useState<'form' | 'histori' | 'cek' | 'admin-nilai'>(
    isAdmin ? 'admin-nilai' : 'form'
  );

  // Submission form (Siswa)
  const [mapel, setMapel] = useState('');
  const [tanggalTugas, setTanggalTugas] = useState(getTodayWIB());
  const [keterangan, setKeterangan] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    receiptId?: string;
  } | null>(null);

  // Cek Status
  const [cekNis, setCekNis] = useState(user.role === 'siswa' ? user.nisNip : '');
  const [cekId, setCekId] = useState('');
  const [cekResult, setCekResult] = useState<TugasDigitalRecord | null>(null);
  const [cekError, setCekError] = useState<string | null>(null);

  // Admin Grading Modal
  const [gradingItem, setGradingItem] = useState<TugasDigitalRecord | null>(null);
  const [nilaiInput, setNilaiInput] = useState('');
  const [catatanInput, setCatatanInput] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  const readFileBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = () => reject(new Error('Gagal membaca file.'));
      reader.readAsDataURL(f);
    });

  const handleSubmitTugas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || user.role !== 'siswa') return;
    if (file.size > 10 * 1024 * 1024) {
      setSubmitFeedback({ type: 'error', text: 'Ukuran file maksimal 10 MB.' });
      return;
    }
    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      const fileBase64 = await readFileBase64(file);
      const res = await apiRequest<{ status: boolean; receipt: TugasDigitalRecord }>('/api/tugas/submit', {
        method: 'POST',
        body: JSON.stringify({
          mapel,
          tanggalTugas,
          keterangan,
          fileName: file.name,
          mimeType: file.type,
          fileBase64,
        }),
      });
      setSubmitFeedback({
        type: 'success',
        text: `Tugas berhasil dikumpulkan! Simpan ID Pengumpulan: ${res.receipt.idPengumpulan}`,
        receiptId: res.receipt.idPengumpulan,
      });
      setKeterangan('');
      setFile(null);
      await onRefresh();
    } catch (err) {
      setSubmitFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengirim tugas.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCekStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setCekError(null);
    setCekResult(null);
    try {
      const res = await apiRequest<{ status: boolean; receipt: TugasDigitalRecord }>(
        `/api/tugas/cek?nis=${encodeURIComponent(cekNis)}&id=${encodeURIComponent(cekId)}`
      );
      setCekResult(res.receipt);
    } catch (err) {
      setCekError(err instanceof Error ? err.message : 'Data tidak ditemukan.');
    }
  };

  const openGradeModal = (item: TugasDigitalRecord) => {
    if (!isAdmin) return;
    setGradingItem(item);
    setNilaiInput(item.nilaiTugas || '');
    setCatatanInput(item.catatanNilai || '');
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingItem || !isAdmin) return;
    setSavingGrade(true);
    try {
      await apiRequest(`/api/tugas/${encodeURIComponent(gradingItem.idPengumpulan)}/nilai`, {
        method: 'PUT',
        body: JSON.stringify({ nilaiTugas: nilaiInput, catatanNilai: catatanInput }),
      });
      setGradingItem(null);
      await onRefresh();
    } finally {
      setSavingGrade(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-indigo-100">Portal Akademik Digital</p>
          <h2 className="text-lg font-extrabold mt-0.5">Platform Pengumpulan Tugas Digital Siswa</h2>
          <p className="text-xs text-indigo-100/90 mt-1">
            Unggah dokumen tugas pembelajaran siswa serta penilaian khusus Administrator.
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
        {user.role === 'siswa' && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('form')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                subTab === 'form'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Formulir Pengumpulan
            </button>
            <button
              type="button"
              onClick={() => setSubTab('histori')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                subTab === 'histori'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Histori Tugas Saya
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setSubTab('cek')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
            subTab === 'cek'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Cek Status Pengumpulan
        </button>

        {/* Tab Cek & Nilai Tugas Khusus Admin */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setSubTab('admin-nilai')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition ${
              subTab === 'admin-nilai'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-indigo-700 dark:text-indigo-300'
            }`}
          >
            Cek &amp; Nilai Tugas (Admin)
          </button>
        )}
      </div>

      {/* Formulir Pengumpulan (Siswa) */}
      {subTab === 'form' && user.role === 'siswa' && (
        <form
          onSubmit={handleSubmitTugas}
          className="max-w-3xl p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="block text-[11px] text-slate-500">NIS</span>
              <strong className="font-mono text-indigo-600 dark:text-indigo-400">{user.nisNip}</strong>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500">Nama Siswa</span>
              <strong className="text-slate-900 dark:text-white">{user.nama}</strong>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500">Kelas</span>
              <strong className="text-emerald-600 dark:text-emerald-400">{user.kelas}</strong>
            </div>
          </div>

          {submitFeedback && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold border ${
                submitFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-700 dark:text-rose-300'
              }`}
            >
              {submitFeedback.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Mata Pelajaran *
              </label>
              <select
                required
                value={mapel}
                onChange={(e) => setMapel(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white"
              >
                <option value="">-- Pilih Mata Pelajaran --</option>
                {mapelList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Tanggal Tugas *
              </label>
              <input
                type="date"
                required
                value={tanggalTugas}
                onChange={(e) => setTanggalTugas(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Judul / Keterangan Tugas *
            </label>
            <textarea
              rows={2}
              required
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Laporan Praktikum Jaringan Dasar Bab 3"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>

          <div className="text-xs space-y-2">
            <label className="block font-semibold text-slate-700 dark:text-slate-300">
              Unggah Berkas Tugas (PDF, DOC, DOCX, JPG, PNG, WEBP · Maks 10 MB) *
            </label>
            <label className="block p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 bg-slate-50 dark:bg-slate-800/40 text-center cursor-pointer transition">
              <CloudUpload className="w-7 h-7 mx-auto text-indigo-600 dark:text-indigo-400 mb-2" />
              <p className="font-semibold text-slate-900 dark:text-white">
                {file ? file.name : 'Klik untuk memilih dokumen tugas'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Maksimal ukuran file 10 MB'}
              </p>
              <input
                type="file"
                required
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !file}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-500/20"
          >
            {submitting ? 'Mengunggah Berkas...' : 'Kirim Tugas Sekarang'}
          </button>
        </form>
      )}

      {/* Histori Tugas Saya */}
      {subTab === 'histori' && user.role === 'siswa' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">ID Pengumpulan</th>
                <th className="p-3">Mata Pelajaran</th>
                <th className="p-3">Keterangan</th>
                <th className="p-3">Berkas</th>
                <th className="p-3 text-center">Nilai</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {historiTugas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Belum ada tugas yang dikumpulkan.
                  </td>
                </tr>
              ) : (
                historiTugas.map((t) => (
                  <tr key={t.idPengumpulan} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {t.idPengumpulan}
                    </td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{t.mapel}</td>
                    <td className="p-3">{t.keterangan}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() =>
                          downloadProtectedFile(
                            `/api/tugas/${encodeURIComponent(t.idPengumpulan)}/download`,
                            t.namaFile
                          )
                        }
                        className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh</span>
                      </button>
                    </td>
                    <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {t.nilaiTugas || '-'}
                    </td>
                    <td className="p-3 text-center font-semibold">{t.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Cek Status Pengumpulan */}
      {subTab === 'cek' && (
        <div className="max-w-2xl p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <form onSubmit={handleCekStatus} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <input
              type="text"
              required
              value={cekNis}
              onChange={(e) => setCekNis(e.target.value)}
              placeholder="NIS Siswa"
              readOnly={user.role === 'siswa'}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
            <input
              type="text"
              required
              value={cekId}
              onChange={(e) => setCekId(e.target.value.toUpperCase())}
              placeholder="ID Pengumpulan (TGS-...)"
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 uppercase font-mono text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Cek Status</span>
            </button>
          </form>

          {cekError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {cekError}
            </div>
          )}

          {cekResult && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                <span>Status: {cekResult.status}</span>
              </div>
              <p>
                Siswa: <strong>{cekResult.namaSiswa}</strong> ({cekResult.kelas}) · Mapel:{' '}
                <strong>{cekResult.mapel}</strong>
              </p>
              <p>
                Nilai: <strong>{cekResult.nilaiTugas || 'Menunggu Penilaian Admin'}</strong>
                {cekResult.catatanNilai ? ` · Catatan: ${cekResult.catatanNilai}` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Cek & Nilai Tugas (Khusus ADMIN Only) */}
      {subTab === 'admin-nilai' && isAdmin && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Cek &amp; Nilai Tugas Siswa (Akses Khusus Admin)
              </h3>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">{historiTugas.length} Tugas Masuk</span>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3">ID &amp; Waktu</th>
                  <th className="p-3">Siswa</th>
                  <th className="p-3">Kelas</th>
                  <th className="p-3">Mata Pelajaran</th>
                  <th className="p-3">Berkas</th>
                  <th className="p-3 text-center">Nilai</th>
                  <th className="p-3 text-center">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {historiTugas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Belum ada pengumpulan tugas dari siswa.
                    </td>
                  </tr>
                ) : (
                  historiTugas.map((t) => (
                    <tr key={t.idPengumpulan} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3">
                        <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {t.idPengumpulan}
                        </div>
                        <div className="text-[11px] text-slate-500">{t.waktuPengiriman}</div>
                      </td>
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">
                        {t.namaSiswa}
                        <span className="block text-[11px] font-mono text-slate-500">{t.nis}</span>
                      </td>
                      <td className="p-3">{t.kelas}</td>
                      <td className="p-3">{t.mapel}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() =>
                            downloadProtectedFile(
                              `/api/tugas/${encodeURIComponent(t.idPengumpulan)}/download`,
                              t.namaFile
                            )
                          }
                          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Unduh File</span>
                        </button>
                      </td>
                      <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {t.nilaiTugas || 'Belum'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => openGradeModal(t)}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold text-xs"
                        >
                          Beri / Update Nilai
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Penilaian Tugas (Admin Only) */}
      {gradingItem && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Penilaian Tugas Siswa (Admin)
              </h3>
              <button
                type="button"
                onClick={() => setGradingItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
              <p>
                Siswa: <strong>{gradingItem.namaSiswa}</strong> ({gradingItem.kelas})
              </p>
              <p>
                Mapel: <strong>{gradingItem.mapel}</strong>
              </p>
              <p>Keterangan: {gradingItem.keterangan}</p>
            </div>

            <form onSubmit={handleSaveGrade} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nilai Tugas (0 - 100) *
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  required
                  value={nilaiInput}
                  onChange={(e) => setNilaiInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Evaluasi
                </label>
                <textarea
                  rows={2}
                  value={catatanInput}
                  onChange={(e) => setCatatanInput(e.target.value)}
                  placeholder="Catatan untuk siswa..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGradingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingGrade}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold"
                >
                  {savingGrade ? 'Menyimpan...' : 'Simpan Nilai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
