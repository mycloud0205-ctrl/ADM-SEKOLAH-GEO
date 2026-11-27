export type UserRole = 'admin' | 'guru' | 'karyawan' | 'siswa';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  nama: string;
  nisNip: string;
  kelas: string;
  jurusan?: string;
  jk: string;
  tempatPkl?: string;
  nilaiSm1?: string;
  nilaiSm2?: string;
  statusSm1?: string;
  statusSm2?: string;
  tugasBelumSm1?: string;
  tugasBelumSm2?: string;
}

export type JenjangSekolah = 'SMK' | 'SMA' | 'SMP';

export interface PengaturanSekolah {
  namaSekolah: string;
  alamatSekolah: string;
  tahunAjaran: string;
  jenjangSekolah?: JenjangSekolah;
  namaWalikelas: string;
  kelasAmpu: string;
  latGps: number;
  lngGps: number;
  radiusMeter: number;
  footerApp: string;
  logoSekolah: string;
}

export interface HakAksesItem {
  id: string;
  nama: string;
  admin: boolean;
  guru: boolean;
  karyawan: boolean;
  siswa: boolean;
}

export interface SiswaRecord {
  id: number;
  nis: string;
  nama: string;
  kelas: string;
  jurusan: string;
  jk: string;
  tempatPkl: string;
  nilaiSm1: string;
  nilaiSm2: string;
  statusSm1: string;
  statusSm2: string;
  tugasBelumSm1: string;
  tugasBelumSm2: string;
}

export type AttendanceStatus = 'Hadir' | 'Izin' | 'Sakit' | 'Alpa' | 'Terlambat';

export interface KehadiranSiswaRecord {
  id: number;
  tglAbsen: string;
  waktuInput: string;
  nis: string;
  nama: string;
  kelas: string;
  jurusan: string;
  jk: string;
  status: AttendanceStatus;
  jarakMeter: string;
}

export interface KehadiranPegawaiRecord {
  id: number;
  tglAbsen: string;
  waktuInput: string;
  nipUser: string;
  nama: string;
  roleJabatan: string;
  jk: string;
  status: AttendanceStatus;
  jarakMeter: string;
}

export interface KalenderRecord {
  id: number;
  tanggal: string;
  modeKbm: 'Luring' | 'Daring' | 'Libur';
  statusEfektif: 'Efektif' | 'Tidak Efektif';
  jamMulai: string;
  jamSelesai: string;
  keterangan: string;
  wajibGps?: boolean;
}

export interface JadwalRecord {
  id: number;
  hari: string;
  jam: string;
  kelas: string;
  mapel: string;
  guru: string;
  ruang: string;
}

export interface JurnalRecord {
  id: number;
  waktuInput: string;
  tanggal: string;
  guruNama: string;
  jamKe: string;
  kelas: string;
  mapel: string;
  tujuan: string;
  materi: string;
  metode: string;
  refleksi: string;
  tugas: string;
  nilaiProgres: string;
  fotoUrl: string;
}

export interface PembinaanRecord {
  id: number;
  waktuInput: string;
  tanggal: string;
  nis: string;
  nama: string;
  kelas: string;
  guruPembina: string;
  jenis: string;
  poin: number;
  uraian: string;
  solusi: string;
}

export interface TugasDigitalRecord {
  idPengumpulan: string;
  waktuPengiriman: string;
  nis: string;
  namaSiswa: string;
  kelas: string;
  tanggalTugas: string;
  mapel: string;
  keterangan: string;
  namaFile: string;
  status: string;
  nilaiTugas: string;
  catatanNilai: string;
}

export interface JurusanRecord {
  id: number;
  kode: string;
  nama: string;
  kurikulum: string;
  fasilitas: string;
}

export interface NilaiSiswaRecord {
  id: number;
  tahunAjaran: string;
  semester: string;
  nis: string;
  mapel: string;
  nilai: number;
  status: string;
  catatan: string;
  guruNama: string;
  updatedAt: string;
}

export interface AgendaRecord {
  id: number;
  tanggal: string;
  judul: string;
  kategori: string;
  keterangan: string;
}

export interface UserAccountRecord {
  id: number;
  username: string;
  role: UserRole;
  nama: string;
  nisNip: string;
  kelas: string;
  jk: string;
}

export interface BootstrapPayload {
  authenticated: boolean;
  adminClaimed: boolean;
  mysqlConfigured?: boolean;
  supabaseConfigured: boolean;
  serverTime: {
    todayStr: string;
    timeStr: string;
    hhmmStr: string;
    timestampMs: number;
  };
  pengaturan: PengaturanSekolah;
  kalenderHariIni: KalenderRecord;
  mapel: string[];
  siswa: SiswaRecord[];
  kehadiran: KehadiranSiswaRecord[];
  kehadiranPegawai: KehadiranPegawaiRecord[];
  historiTugas: TugasDigitalRecord[];
  pembinaan: PembinaanRecord[];
  jurnal: JurnalRecord[];
  users: UserAccountRecord[];
  jurusan: JurusanRecord[];
  jadwal: JadwalRecord[];
  agenda: AgendaRecord[];
  kalender: KalenderRecord[];
  nilaiSiswa: NilaiSiswaRecord[];
  hakAkses: HakAksesItem[];
}
