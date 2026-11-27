import React, { useMemo, useState } from 'react';
import { FileDown, Plus, Search, ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '../utils/api';
import { downloadPembinaanPdf } from '../utils/pdfExport';
import { formatHariTanggal, getTodayWIB } from '../shared/scheduleConstants';
import type { AuthUser, PembinaanRecord, PengaturanSekolah, SiswaRecord } from '../shared/types';

interface PembinaanViewProps {
  user: AuthUser;
  pengaturan: PengaturanSekolah;
  siswa: SiswaRecord[];
  pembinaan: PembinaanRecord[];
  onRefresh: () => Promise<void>;
}

export const PembinaanView: React.FC<PembinaanViewProps> = ({
  user,
  pengaturan,
  siswa,
  pembinaan,
  onRefresh,
}) => {
  const [filterKelas, setFilterKelas] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // Modal fields: filter kelas dulu atau cari nama siswa
  const [modalFilterKelas, setModalFilterKelas] = useState('');
  const [modalSearchNama, setModalSearchNama] = useState('');
  const [selectedNis, setSelectedNis] = useState('');
  const [tanggal, setTanggal] = useState(getTodayWIB());
  const [jenis, setJenis] = useState('Pelanggaran');
  const [poin, setPoin] = useState('5');
  const [uraian, setUraian] = useState('');
  const [solusi, setSolusi] = useState('');
  const [saving, setSaving] = useState(false);

  const kelasList = useMemo(() => {
    const s = new Set([...siswa.map((x) => x.kelas), ...pembinaan.map((p) => p.kelas)].filter(Boolean));
    return Array.from(s).sort();
  }, [siswa, pembinaan]);

  const filteredModalSiswa = useMemo(() => {
    const q = modalSearchNama.trim().toLowerCase();
    return siswa.filter((s) => {
      const matchKls = !modalFilterKelas || s.kelas === modalFilterKelas;
      const matchNama = !q || s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q);
      return matchKls && matchNama;
    });
  }, [siswa, modalFilterKelas, modalSearchNama]);

  const filteredPembinaan = useMemo(() => {
    if (!filterKelas) return pembinaan;
    return pembinaan.filter((p) => p.kelas === filterKelas);
  }, [pembinaan, filterKelas]);

  const handleOpenModal = () => {
    setModalFilterKelas('');
    setModalSearchNama('');
    setSelectedNis('');
    setTanggal(getTodayWIB());
    setJenis('Pelanggaran');
    setPoin('5');
    setUraian('');
    setSolusi('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSiswa = siswa.find((s) => s.nis === selectedNis);
    if (!targetSiswa) return;
    setSaving(true);
    try {
      await apiRequest('/api/pembinaan', {
        method: 'POST',
        body: JSON.stringify({
          tanggal,
          nis: targetSiswa.nis,
          nama: targetSiswa.nama,
          kelas: targetSiswa.kelas,
          jenis,
          poin: Number(poin) || 0,
          uraian,
          solusi,
        }),
      });
      setModalOpen(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Rekap Riwayat Pembinaan Per Kelas */}
      {user.role !== 'siswa' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Rekap Riwayat Pembinaan &amp; Poin Per Kelas
              </h3>
            </div>
            {filterKelas && (
              <button
                type="button"
                onClick={() => setFilterKelas('')}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Tampilkan Semua Kelas
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {kelasList.map((k) => {
              const items = pembinaan.filter((p) => p.kelas === k);
              const totalPoin = items.reduce((acc, cur) => acc + (Number(cur.poin) || 0), 0);
              const active = filterKelas === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilterKelas(active ? '' : k)}
                  className={`p-3.5 rounded-xl border text-left transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-indigo-300'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900 dark:text-white">{k}</div>
                  <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
                    {items.length} Catatan
                  </div>
                  <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium tabular-nums">
                    Total Poin: {totalPoin}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabel Riwayat Pembinaan */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Riwayat Pembinaan Siswa</h3>
          <div className="flex flex-wrap items-center gap-2">
            {user.role !== 'siswa' && (
              <select
                value={filterKelas}
                onChange={(e) => setFilterKelas(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
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
              onClick={() => downloadPembinaanPdf(pengaturan, pembinaan, filterKelas)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm transition"
            >
              <FileDown className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            {user.role !== 'siswa' && (
              <button
                type="button"
                onClick={handleOpenModal}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Pembinaan</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Tanggal</th>
                <th className="p-3">NIS</th>
                <th className="p-3">Nama Siswa</th>
                <th className="p-3">Kelas</th>
                <th className="p-3">Kategori</th>
                <th className="p-3 text-center">Poin</th>
                <th className="p-3">Uraian Permasalahan</th>
                <th className="p-3">Solusi / Tindak Lanjut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredPembinaan.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    Belum ada riwayat pembinaan siswa.
                  </td>
                </tr>
              ) : (
                filteredPembinaan.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-3 whitespace-nowrap">{formatHariTanggal(p.tanggal)}</td>
                    <td className="p-3 font-mono text-indigo-600 dark:text-indigo-400">{p.nis}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{p.nama}</td>
                    <td className="p-3">{p.kelas}</td>
                    <td className="p-3 font-medium">{p.jenis}</td>
                    <td className="p-3 text-center font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                      {p.poin}
                    </td>
                    <td className="p-3">{p.uraian}</td>
                    <td className="p-3 text-emerald-700 dark:text-emerald-400">{p.solusi}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah Pembinaan: Cari Nama atau Filter Kelas Dulu */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tambah Catatan Pembinaan Siswa
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      1. Filter Kelas (Opsional)
                    </label>
                    <select
                      value={modalFilterKelas}
                      onChange={(e) => setModalFilterKelas(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-white"
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
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      2. Cari Nama / NIS Siswa
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={modalSearchNama}
                        onChange={(e) => setModalSearchNama(e.target.value)}
                        placeholder="Ketik nama atau NIS..."
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                    3. Pilih Siswa ({filteredModalSiswa.length} ditemukan) *
                  </label>
                  <select
                    required
                    value={selectedNis}
                    onChange={(e) => setSelectedNis(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"
                  >
                    <option value="">-- Pilih Siswa --</option>
                    {filteredModalSiswa.map((s) => (
                      <option key={s.nis} value={s.nis}>
                        {s.nama} ({s.nis} - {s.kelas})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tanggal *
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Kategori *
                  </label>
                  <select
                    value={jenis}
                    onChange={(e) => setJenis(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="Pelanggaran">Pelanggaran</option>
                    <option value="Pembinaan Khusus">Pembinaan Khusus</option>
                    <option value="Prestasi">Prestasi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Poin *
                  </label>
                  <input
                    type="number"
                    required
                    value={poin}
                    onChange={(e) => setPoin(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Uraian Permasalahan *
                </label>
                <textarea
                  rows={2}
                  required
                  value={uraian}
                  onChange={(e) => setUraian(e.target.value)}
                  placeholder="Jelaskan permasalahan atau prestasi siswa..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Solusi / Tindak Lanjut *
                </label>
                <textarea
                  rows={2}
                  required
                  value={solusi}
                  onChange={(e) => setSolusi(e.target.value)}
                  placeholder="Rencana tindak lanjut atau pembinaan..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Catatan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
