import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Save,
  Search,
  Upload,
} from 'lucide-react';
import { apiRequest } from '../utils/api';
import type {
  AuthUser,
  JadwalRecord,
  NilaiSiswaRecord,
  PengaturanSekolah,
  SiswaRecord,
} from '../shared/types';

interface RekapAkademikViewProps {
  user: AuthUser;
  pengaturan: PengaturanSekolah;
  siswa: SiswaRecord[];
  mapelList: string[];
  jadwal: JadwalRecord[];
  nilaiSiswa: NilaiSiswaRecord[];
  onRefresh: () => Promise<void>;
}

interface GradeDraft {
  nilai: number;
  catatan: string;
}

export const RekapAkademikView: React.FC<RekapAkademikViewProps> = ({
  user,
  pengaturan,
  siswa,
  mapelList,
  jadwal,
  nilaiSiswa,
  onRefresh,
}) => {
  const canEdit = user.role === 'admin' || user.role === 'guru';
  const tahunAjaran = pengaturan.tahunAjaran || '2026/2027';

  // Mapel yang diampu guru sesuai jadwal mengajarnya (atau semua mapel untuk admin)
  const guruMapels = useMemo(() => {
    const set = new Set<string>();
    jadwal.forEach((j) => {
      if (user.role === 'admin' || j.guru.trim().toLowerCase() === user.nama.trim().toLowerCase()) {
        if (j.mapel) set.add(j.mapel);
      }
    });
    return Array.from(set).sort();
  }, [jadwal, user.nama, user.role]);

  const availableMapels = useMemo(() => {
    const set = new Set<string>([...guruMapels, ...mapelList].filter(Boolean));
    return Array.from(set).sort();
  }, [guruMapels, mapelList]);

  const [selectedMapel, setSelectedMapel] = useState<string>(() => guruMapels[0] || availableMapels[0] || '');
  const [semester, setSemester] = useState<'1' | '2'>('1');
  const [filterKelas, setFilterKelas] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!selectedMapel && availableMapels.length > 0) {
      setSelectedMapel(guruMapels[0] || availableMapels[0]);
    }
  }, [selectedMapel, guruMapels, availableMapels]);

  const kelasList = useMemo(() => {
    const s = new Set(siswa.map((x) => x.kelas).filter(Boolean));
    return Array.from(s).sort();
  }, [siswa]);

  const filteredSiswa = useMemo(() => {
    const q = search.trim().toLowerCase();
    return siswa.filter((s) => {
      const matchKls = !filterKelas || s.kelas === filterKelas;
      const matchSearch = !q || s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q);
      return matchKls && matchSearch;
    });
  }, [siswa, filterKelas, search]);

  // Populate draft nilai per siswa untuk Mapel & Semester terpilih — DEFAULT = 0
  useEffect(() => {
    const next: Record<string, GradeDraft> = {};
    for (const s of siswa) {
      const rec = nilaiSiswa.find(
        (n) =>
          n.nis.toLowerCase() === s.nis.toLowerCase() &&
          n.mapel.toLowerCase() === selectedMapel.toLowerCase() &&
          n.semester === semester &&
          n.tahunAjaran === tahunAjaran
      );
      next[s.nis] = {
        nilai: rec ? Number(rec.nilai) || 0 : 0,
        catatan: rec?.catatan || '',
      };
    }
    setDrafts(next);
  }, [siswa, nilaiSiswa, selectedMapel, semester, tahunAjaran]);

  const summary = useMemo(() => {
    let total = 0;
    let tuntas = 0;
    let defaultZero = 0;
    for (const s of filteredSiswa) {
      const val = drafts[s.nis]?.nilai ?? 0;
      total += val;
      if (val >= 75) tuntas++;
      if (val === 0) defaultZero++;
    }
    const avg = filteredSiswa.length > 0 ? Math.round((total / filteredSiswa.length) * 10) / 10 : 0;
    return { count: filteredSiswa.length, tuntas, defaultZero, avg };
  }, [filteredSiswa, drafts]);

  const handleNilaiChange = (nis: string, rawValue: string) => {
    const num = rawValue === '' ? 0 : Number(rawValue);
    const clamped = Number.isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
    setDrafts((prev) => ({
      ...prev,
      [nis]: {
        nilai: clamped,
        catatan: prev[nis]?.catatan || '',
      },
    }));
  };

  const handleCatatanChange = (nis: string, catatan: string) => {
    setDrafts((prev) => ({
      ...prev,
      [nis]: {
        nilai: prev[nis]?.nilai ?? 0,
        catatan,
      },
    }));
  };

  const handleSaveBatch = async () => {
    if (!canEdit || !selectedMapel || filteredSiswa.length === 0) return;
    setSaving(true);
    setFeedback(null);
    try {
      const batch = filteredSiswa.map((s) => {
        const val = drafts[s.nis]?.nilai ?? 0;
        return {
          tahunAjaran,
          semester,
          nis: s.nis,
          mapel: selectedMapel,
          nilai: val,
          status: val >= 75 ? 'Tuntas' : val > 0 ? 'Remedial' : 'Belum Tuntas',
          catatan: drafts[s.nis]?.catatan || '',
        };
      });
      const res = await apiRequest<{ status: boolean; message: string }>('/api/nilai/batch', {
        method: 'POST',
        body: JSON.stringify({ batch }),
      });
      setFeedback({ type: 'success', text: res.message });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal menyimpan nilai siswa.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplateCsv = () => {
    const header = 'NIS,NAMA SISWA,KELAS,MAPEL,SEMESTER,NILAI,CATATAN';
    const rows = filteredSiswa.map((s) => {
      const d = drafts[s.nis] || { nilai: 0, catatan: '' };
      return `"${s.nis}","${s.nama}","${s.kelas}","${selectedMapel}","${semester}",${d.nilai},"${d.catatan.replace(/"/g, '""')}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeMapel = (selectedMapel || 'Mapel').replace(/[^a-zA-Z0-9]+/g, '_');
    link.download = `Format_Nilai_${safeMapel}_SM${semester}_${tahunAjaran.replace('/', '-')}.csv`;
    link.click();
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit) return;
    setImporting(true);
    setFeedback(null);
    try {
      const csvContent = await file.text();
      const res = await apiRequest<{ status: boolean; message: string }>('/api/nilai/import', {
        method: 'POST',
        body: JSON.stringify({
          csvContent,
          mapel: selectedMapel,
          semester,
          tahunAjaran,
        }),
      });
      setFeedback({ type: 'success', text: res.message });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengimpor file nilai.',
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-2.5">
          <GraduationCap className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Rekap Nilai &amp; Akademik Siswa per Mata Pelajaran
              </h3>
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                TA {tahunAjaran} · Semester {semester}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Guru dapat memperbarui nilai sesuai Mata Pelajaran (nilai default <strong>0</strong>) atau mengimpor file CSV sesuai format sistem.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplateCsv}
            disabled={filteredSiswa.length === 0}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Format CSV</span>
          </button>

          {canEdit && (
            <label className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition">
              <Upload className="w-3.5 h-3.5" />
              <span>{importing ? 'Mengimpor...' : 'Import File CSV'}</span>
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

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Mata Pelajaran (Mapel)
          </label>
          <select
            value={selectedMapel}
            onChange={(e) => {
              setSelectedMapel(e.target.value);
              setFeedback(null);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
          >
            {availableMapels.length === 0 && <option value="">-- Belum Ada Mapel --</option>}
            {availableMapels.map((m) => (
              <option key={m} value={m}>
                {guruMapels.includes(m) && user.role === 'guru' ? `★ ${m} (Mapel Anda)` : m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Semester
          </label>
          <select
            value={semester}
            onChange={(e) => {
              setSemester(e.target.value as '1' | '2');
              setFeedback(null);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
          >
            <option value="1">Semester 1 (Ganjil)</option>
            <option value="2">Semester 2 (Genap)</option>
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Filter Kelas
          </label>
          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white"
          >
            <option value="">Semua Kelas</option>
            {kelasList.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Cari Siswa
          </label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari NIS / Nama..."
              className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
          </div>
        </div>
      </div>

      {/* Info & Format Hint */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-slate-700 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Mapel: {selectedMapel || '-'}</span>
          </span>
          <span>
            Siswa: <strong className="tabular-nums">{summary.count}</strong>
          </span>
          <span>
            Tuntas (&ge;75): <strong className="text-emerald-600 tabular-nums">{summary.tuntas}</strong>
          </span>
          <span>
            Default 0: <strong className="text-slate-600 dark:text-slate-200 tabular-nums">{summary.defaultZero}</strong>
          </span>
          <span>
            Rata-rata: <strong className="text-indigo-600 dark:text-indigo-400 tabular-nums">{summary.avg}</strong>
          </span>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleSaveBatch}
            disabled={saving || !selectedMapel || filteredSiswa.length === 0}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 text-white font-bold inline-flex items-center gap-1.5 shadow-sm transition whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Nilai Mapel'}</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl px-3.5 py-2">
        <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span>
          Mendukung Import file format CSV sistem (<code className="font-mono">NIS,NAMA SISWA,KELAS,MAPEL,SEMESTER,NILAI,CATATAN</code> maupun format CSV daftar siswa sistem dengan kolom <code className="font-mono">NIS</code> — nilai kosong otomatis default <strong>0</strong>).
        </span>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 text-rose-700 dark:text-rose-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Tabel Nilai Siswa */}
      <div className="overflow-x-auto custom-scrollbar max-h-[540px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-slate-700">
              <th className="p-3 w-10">No</th>
              <th className="p-3">NIS</th>
              <th className="p-3">Nama Siswa</th>
              <th className="p-3">Kelas</th>
              {pengaturan.jenjangSekolah === 'SMK' && <th className="p-3">Jurusan / PKL</th>}
              <th className="p-3 text-center w-28">NILAI</th>
              <th className="p-3 text-center w-32">Status</th>
              <th className="p-3 min-w-[180px]">Catatan Guru</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredSiswa.length === 0 ? (
              <tr>
                <td colSpan={pengaturan.jenjangSekolah === 'SMK' ? 8 : 7} className="p-8 text-center text-slate-500">
                  Tidak ada data siswa untuk filter ini.
                </td>
              </tr>
            ) : (
              filteredSiswa.map((s, idx) => {
                const draft = drafts[s.nis] ?? { nilai: 0, catatan: '' };
                const nilaiVal = draft.nilai;
                const statusText = nilaiVal >= 75 ? 'Tuntas' : nilaiVal > 0 ? 'Remedial' : 'Belum Tuntas';
                const statusBadge =
                  nilaiVal >= 75
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : nilaiVal > 0
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

                return (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 tabular-nums text-slate-500">{idx + 1}</td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{s.nis}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{s.nama}</td>
                    <td className="p-3 font-medium">{s.kelas}</td>
                    {pengaturan.jenjangSekolah === 'SMK' && (
                      <td className="p-3 text-slate-500 dark:text-slate-400">
                        {s.jurusan}
                        {s.tempatPkl && s.tempatPkl !== '-' ? ` · PKL: ${s.tempatPkl}` : ''}
                      </td>
                    )}
                    <td className="p-3 text-center">
                      {canEdit ? (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="1"
                          value={nilaiVal}
                          onChange={(e) => handleNilaiChange(s.nis, e.target.value)}
                          className="w-20 px-2.5 py-1.5 text-center rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-extrabold text-slate-900 dark:text-white tabular-nums focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      ) : (
                        <span className="font-extrabold tabular-nums text-slate-900 dark:text-white">
                          {nilaiVal}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusBadge}`}>
                        {statusText}
                      </span>
                    </td>
                    <td className="p-3">
                      {canEdit ? (
                        <input
                          type="text"
                          value={draft.catatan}
                          onChange={(e) => handleCatatanChange(s.nis, e.target.value)}
                          placeholder="Catatan capaian..."
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                        />
                      ) : (
                        <span className="text-slate-500">{draft.catatan || '-'}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
