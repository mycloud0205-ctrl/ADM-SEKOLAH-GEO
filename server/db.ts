import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getNamaHariWIB, getTodayWIB } from '../src/shared/scheduleConstants.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const UPLOAD_DIR = path.resolve(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const db = new Database(path.join(DATA_DIR, 'school.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256:${iterations}:${salt}:${derived}`;
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  if (storedHash.startsWith('pbkdf2_sha256:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const keyHex = parts[3];
    if (!iterations || !salt || !keyHex) return false;
    const derived = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    const storedBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pengaturan (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nama_sekolah TEXT NOT NULL,
      alamat_sekolah TEXT NOT NULL,
      tahun_ajaran TEXT NOT NULL,
      jenjang_sekolah TEXT NOT NULL DEFAULT 'SMK',
      nama_walikelas TEXT NOT NULL,
      kelas_ampu TEXT NOT NULL,
      lat_gps REAL NOT NULL,
      lng_gps REAL NOT NULL,
      radius_meter INTEGER NOT NULL,
      footer_app TEXT NOT NULL,
      logo_sekolah TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS hak_akses_role (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      admin INTEGER NOT NULL DEFAULT 1,
      guru INTEGER NOT NULL DEFAULT 1,
      karyawan INTEGER NOT NULL DEFAULT 0,
      siswa INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS siswa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nis TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      kelas TEXT NOT NULL,
      jurusan TEXT NOT NULL,
      jk TEXT NOT NULL DEFAULT 'L',
      tempat_pkl TEXT NOT NULL DEFAULT '-',
      nilai_sm1 TEXT NOT NULL DEFAULT '-',
      nilai_sm2 TEXT NOT NULL DEFAULT '-',
      status_sm1 TEXT NOT NULL DEFAULT '-',
      status_sm2 TEXT NOT NULL DEFAULT '-',
      tugas_belum_sm1 TEXT NOT NULL DEFAULT '-',
      tugas_belum_sm2 TEXT NOT NULL DEFAULT '-'
    );

    CREATE TABLE IF NOT EXISTS kehadiran_siswa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tgl_absen TEXT NOT NULL,
      waktu_input TEXT NOT NULL,
      nis TEXT NOT NULL,
      nama TEXT NOT NULL,
      kelas TEXT NOT NULL,
      jurusan TEXT NOT NULL DEFAULT '-',
      jk TEXT NOT NULL DEFAULT '-',
      status TEXT NOT NULL DEFAULT 'Hadir',
      jarak_meter TEXT NOT NULL DEFAULT '-',
      UNIQUE(tgl_absen, nis)
    );

    CREATE TABLE IF NOT EXISTS kehadiran_pegawai (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tgl_absen TEXT NOT NULL,
      waktu_input TEXT NOT NULL,
      nip_user TEXT NOT NULL,
      nama TEXT NOT NULL,
      role_jabatan TEXT NOT NULL,
      jk TEXT NOT NULL DEFAULT 'L',
      status TEXT NOT NULL DEFAULT 'Hadir',
      jarak_meter TEXT NOT NULL DEFAULT '-',
      UNIQUE(tgl_absen, nip_user)
    );

    CREATE TABLE IF NOT EXISTS kalender_pendidikan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT UNIQUE NOT NULL,
      mode_kbm TEXT NOT NULL,
      status_efektif TEXT NOT NULL,
      jam_mulai TEXT NOT NULL,
      jam_selesai TEXT NOT NULL,
      keterangan TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pengumpulan_tugas (
      id_pengumpulan TEXT PRIMARY KEY,
      waktu_pengiriman TEXT NOT NULL,
      nis TEXT NOT NULL,
      nama_siswa TEXT NOT NULL,
      kelas TEXT NOT NULL,
      tanggal_tugas TEXT NOT NULL,
      mapel TEXT NOT NULL,
      keterangan TEXT NOT NULL,
      nama_file TEXT NOT NULL,
      file_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Terkirim',
      nilai_tugas TEXT NOT NULL DEFAULT '',
      catatan_nilai TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      nama TEXT NOT NULL,
      nis_nip TEXT NOT NULL,
      kelas TEXT NOT NULL DEFAULT 'ALL',
      jk TEXT NOT NULL DEFAULT 'L'
    );

    CREATE TABLE IF NOT EXISTS jurnal_harian (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waktu_input TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      guru_nama TEXT NOT NULL,
      jam_ke TEXT NOT NULL,
      kelas TEXT NOT NULL,
      mapel TEXT NOT NULL,
      tujuan TEXT NOT NULL DEFAULT '-',
      materi TEXT NOT NULL,
      metode TEXT NOT NULL DEFAULT '-',
      refleksi TEXT NOT NULL DEFAULT '-',
      tugas TEXT NOT NULL DEFAULT '-',
      nilai_progres TEXT NOT NULL DEFAULT '-',
      foto_url TEXT NOT NULL DEFAULT '-'
    );

    CREATE TABLE IF NOT EXISTS pembinaan_siswa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waktu_input TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      nis TEXT NOT NULL,
      nama TEXT NOT NULL,
      kelas TEXT NOT NULL,
      guru_pembina TEXT NOT NULL,
      jenis TEXT NOT NULL,
      poin INTEGER NOT NULL DEFAULT 0,
      uraian TEXT NOT NULL,
      solusi TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jadwal_pelajaran (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hari TEXT NOT NULL,
      jam TEXT NOT NULL,
      kelas TEXT NOT NULL,
      mapel TEXT NOT NULL,
      guru TEXT NOT NULL,
      ruang TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agenda_akademik (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tanggal TEXT NOT NULL,
      judul TEXT NOT NULL,
      kategori TEXT NOT NULL,
      keterangan TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS data_jurusan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kode TEXT UNIQUE NOT NULL,
      nama TEXT NOT NULL,
      kurikulum TEXT NOT NULL,
      fasilitas TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS master_mapel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nilai_siswa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tahun_ajaran TEXT NOT NULL,
      semester TEXT NOT NULL DEFAULT '1',
      nis TEXT NOT NULL,
      mapel TEXT NOT NULL,
      nilai REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Belum Tuntas',
      catatan TEXT NOT NULL DEFAULT '',
      guru_nama TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      UNIQUE(tahun_ajaran, semester, nis, mapel)
    );
  `);

  // Safe migrations for existing school.db
  const pengaturanCols = db.prepare('PRAGMA table_info(pengaturan)').all() as Array<{ name: string }>;
  if (!pengaturanCols.some((c) => c.name === 'jenjang_sekolah')) {
    db.exec("ALTER TABLE pengaturan ADD COLUMN jenjang_sekolah TEXT NOT NULL DEFAULT 'SMK'");
  }

  seedInitialData();
}

function seedInitialData(): void {
  const todayStr = getTodayWIB();
  const todayHari = getNamaHariWIB(todayStr);

  const countPengaturan = (db.prepare('SELECT COUNT(*) as c FROM pengaturan').get() as { c: number }).c;
  if (countPengaturan === 0) {
    db.prepare(`
      INSERT INTO pengaturan (
        id, nama_sekolah, alamat_sekolah, tahun_ajaran, jenjang_sekolah, nama_walikelas, kelas_ampu,
        lat_gps, lng_gps, radius_meter, footer_app, logo_sekolah
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1,
      'SMK KP BALEENDAH',
      'Jl. Adipati Agung No. 32 Baleendah - Kab. Bandung',
      '2026/2027',
      'SMK',
      'Wali Kelas Default',
      'X TJKT 1',
      -7.001759,
      107.623047,
      100,
      '© 2026 TIM IT SMK KP BALEENDAH - SISTEM INTEGRASI SEKOLAH',
      ''
    );
  } else {
    const taMigrated = (
      db.prepare("SELECT value FROM auth_meta WHERE key = 'migrated_ta_2026_2027'").get() as
        | { value: string }
        | undefined
    )?.value;
    if (taMigrated !== 'true') {
      db.prepare("UPDATE pengaturan SET tahun_ajaran = '2026/2027' WHERE id = 1 AND tahun_ajaran = '2025/2026'").run();
      db.prepare("INSERT OR REPLACE INTO auth_meta (key, value) VALUES ('migrated_ta_2026_2027', 'true')").run();
    }
  }

  const countHak = (db.prepare('SELECT COUNT(*) as c FROM hak_akses_role').get() as { c: number }).c;
  if (countHak === 0) {
    const insertHak = db.prepare(
      'INSERT INTO hak_akses_role (id, nama, admin, guru, karyawan, siswa) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const defaults: Array<[string, string, number, number, number, number]> = [
      ['dashboard', 'Dashboard', 1, 1, 1, 1],
      ['dash-kehadiran-guru', 'Dashboard Kehadiran Guru', 1, 1, 1, 0],
      ['scan', 'Presensi GPS / Daring', 1, 1, 1, 1],
      ['rekap-pegawai', 'Data Kehadiran Guru & Karyawan', 1, 1, 1, 0],
      ['tugas-digital', 'Platform Tugas Digital Siswa', 1, 0, 0, 1],
      ['kalender-pendidikan', 'Kalender Sekolah (Luring/Daring)', 1, 1, 1, 1],
      ['input', 'Absensi Kelas', 1, 1, 0, 0],
      ['guru-jadwal', 'Kelola Jadwal Mengajar', 1, 1, 0, 0],
      ['jurnal', 'Jurnal Harian Guru', 1, 1, 0, 0],
      ['pembinaan', 'BK & Pembinaan', 1, 1, 0, 1],
      ['rekap-siswa', 'Rekap Presensi Siswa', 1, 1, 0, 1],
      ['monitoring', 'Jurnal Saya', 1, 1, 0, 0],
      ['master-siswa', 'Data Siswa Sekolah', 1, 1, 0, 0],
      ['rekap-akademik-admin', 'Rekap Nilai & Akademik', 1, 1, 0, 0],
      ['master-users', 'Data Pengguna', 1, 0, 0, 0],
      ['master-jurusan', 'Jurusan & Kurikulum', 1, 1, 0, 0],
      ['master-jadwal', 'Master Jadwal Kelas', 1, 1, 0, 1],
      ['master-hak-akses', 'Pengaturan Hak Akses', 1, 0, 0, 0],
      ['pengaturan-sekolah', 'Pengaturan Sekolah', 1, 0, 0, 0],
    ];
    for (const row of defaults) {
      insertHak.run(...row);
    }
  } else {
    db.prepare(
      "UPDATE hak_akses_role SET nama = 'Kalender Sekolah (Luring/Daring)' WHERE id = 'kalender-pendidikan' AND nama LIKE 'Kalender Pendidikan%'"
    ).run();
  }

  const csvImportFlag = (
    db.prepare("SELECT value FROM auth_meta WHERE key = 'csv_students_imported'").get() as
      | { value: string }
      | undefined
  )?.value;
  const countSiswa = (db.prepare('SELECT COUNT(*) as c FROM siswa').get() as { c: number }).c;

  const defaultCsvPath = path.resolve(process.cwd(), 'public/assets/aistudio/ABSEN_SEKOLAH26_3cdeb6ff.csv');
  if (csvImportFlag !== 'true' && fs.existsSync(defaultCsvPath)) {
    const csvRaw = fs.readFileSync(defaultCsvPath, 'utf8');
    if (countSiswa <= 10) {
      db.prepare('DELETE FROM siswa').run();
    }
    importStudentsFromCsvContent(csvRaw);
    db.prepare("INSERT OR REPLACE INTO auth_meta (key, value) VALUES ('csv_students_imported', 'true')").run();
    db.prepare("UPDATE jadwal_pelajaran SET kelas = 'X TKJ 1' WHERE kelas = 'X TJKT 1'").run();
  } else if (countSiswa === 0) {
    const insertSiswa = db.prepare(`
      INSERT INTO siswa (
        nis, nama, kelas, jurusan, jk, tempat_pkl,
        nilai_sm1, nilai_sm2, status_sm1, status_sm2, tugas_belum_sm1, tugas_belum_sm2
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSiswa.run('262710286', 'A.SUTISNA', 'X TKJ 5', 'Teknik Jaringan Komputer', 'L', '-', '-', '-', '-', '-', '-', '-');
  }

  const countUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (countUsers === 0) {
    // Seed default accounts; admin stays unclaimed until activation or ADMIN_PASSCODE
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, role, nama, nis_nip, kelas, jk) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insertUser.run('admin', '', 'admin', 'Administrator Sekolah', 'ADMIN01', 'ALL', 'L');
    insertUser.run('guru', hashPassword('guru123'), 'guru', 'Guru Pengajar Utama', 'GURU01', 'ALL', 'L');
    insertUser.run('guru2', hashPassword('guru123'), 'guru', 'Ibu Rina Kartika, S.Pd', 'GURU02', 'ALL', 'P');
    insertUser.run('karyawan', hashPassword('karyawan123'), 'karyawan', 'Staf Administrasi TU', 'KARY01', 'ALL', 'P');
  } else {
    // Heal legacy seeded staff accounts that had empty password_hash
    const healStaffStmt = db.prepare(
      "UPDATE users SET password_hash = ? WHERE username = ? AND (password_hash IS NULL OR TRIM(password_hash) = '')"
    );
    healStaffStmt.run(hashPassword('guru123'), 'guru');
    healStaffStmt.run(hashPassword('guru123'), 'guru2');
    healStaffStmt.run(hashPassword('karyawan123'), 'karyawan');
  }

  const countKalender = (db.prepare('SELECT COUNT(*) as c FROM kalender_pendidikan').get() as { c: number }).c;
  if (countKalender === 0 && todayHari !== 'Sabtu' && todayHari !== 'Minggu') {
    db.prepare(
      'INSERT INTO kalender_pendidikan (tanggal, mode_kbm, status_efektif, jam_mulai, jam_selesai, keterangan) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(todayStr, 'Luring', 'Efektif', '06:30', '16:00', 'Kegiatan Belajar Mengajar Tatap Muka (Wajib GPS Sekolah)');
  }

  const countMapel = (db.prepare('SELECT COUNT(*) as c FROM master_mapel').get() as { c: number }).c;
  if (countMapel === 0) {
    const insertMapel = db.prepare('INSERT INTO master_mapel (nama) VALUES (?)');
    ['Pemrograman Web', 'Dasar TJKT', 'Administrasi Infrastruktur Jaringan', 'Bahasa Indonesia', 'Matematika', 'Pendidikan Agama'].forEach((m) =>
      insertMapel.run(m)
    );
  }

  const countJurusan = (db.prepare('SELECT COUNT(*) as c FROM data_jurusan').get() as { c: number }).c;
  if (countJurusan === 0) {
    const insertJurusan = db.prepare('INSERT INTO data_jurusan (kode, nama, kurikulum, fasilitas) VALUES (?, ?, ?, ?)');
    insertJurusan.run('TKJ', 'Teknik Komputer dan Jaringan', 'Kurikulum Merdeka', 'Lab Cisco, Bengkel Komputer');
    insertJurusan.run('TJKT', 'Teknik Jaringan Komputer dan Telekomunikasi', 'Kurikulum Merdeka', 'Lab Fiber Optic, Lab Server');
  }

  const countJadwal = (db.prepare('SELECT COUNT(*) as c FROM jadwal_pelajaran').get() as { c: number }).c;
  if (countJadwal === 0) {
    const activeDay = todayHari === 'Sabtu' || todayHari === 'Minggu' ? 'Senin' : todayHari;
    const insertJadwal = db.prepare(
      'INSERT INTO jadwal_pelajaran (hari, jam, kelas, mapel, guru, ruang) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertJadwal.run(activeDay, 'Jam ke-1 - Jam ke-4 (07:00 - 10:15 WIB)', 'X TKJ 1', 'Dasar TJKT', 'Guru Pengajar Utama', 'Lab TJKT 1');
    insertJadwal.run(activeDay, 'Jam ke-5 - Jam ke-8 (10:15 - 13:45 WIB)', 'XI TJKT 1', 'Pemrograman Web', 'Guru Pengajar Utama', 'Lab RPL');
    insertJadwal.run(activeDay, 'Jam ke-1 - Jam ke-3 (07:00 - 09:15 WIB)', 'X TKJ 5', 'Matematika', 'Ibu Rina Kartika, S.Pd', 'Ruang 12');
    insertJadwal.run(activeDay, 'Jam ke-7 - Jam ke-10 (12:15 - 15:15 WIB)', 'XII TJKT 1', 'Bahasa Indonesia', 'Ibu Rina Kartika, S.Pd', 'Ruang 04');
  }

  const countAgenda = (db.prepare('SELECT COUNT(*) as c FROM agenda_akademik').get() as { c: number }).c;
  if (countAgenda === 0) {
    const insertAgenda = db.prepare('INSERT INTO agenda_akademik (tanggal, judul, kategori, keterangan) VALUES (?, ?, ?, ?)');
    insertAgenda.run(todayStr, 'Monitoring Presensi & KBM Terpadu', 'Akademik', 'Seluruh guru wajib mengisi jurnal KBM dan presensi kelas pada setiap jam mengajar.');
    insertAgenda.run(todayStr, 'Pengumpulan Tugas Digital Semester Genap', 'Tugas', 'Siswa mengumpulkan laporan praktikum melalui platform tugas digital.');
  }

  const countKehadiran = (db.prepare('SELECT COUNT(*) as c FROM kehadiran_siswa').get() as { c: number }).c;
  if (countKehadiran < 20) {
    const allStudents = db.prepare('SELECT nis, nama, kelas, jurusan, jk FROM siswa').all() as Array<{
      nis: string;
      nama: string;
      kelas: string;
      jurusan: string;
      jk: string;
    }>;
    const allStaff = db.prepare('SELECT nis_nip, nama, role, jk FROM users').all() as Array<{
      nis_nip: string;
      nama: string;
      role: string;
      jk: string;
    }>;

    if (allStudents.length > 0) {
      const insertSiswaAbsen = db.prepare(`
        INSERT OR IGNORE INTO kehadiran_siswa (tgl_absen, waktu_input, nis, nama, kelas, jurusan, jk, status, jarak_meter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertPegawaiAbsen = db.prepare(`
        INSERT OR IGNORE INTO kehadiran_pegawai (tgl_absen, waktu_input, nip_user, nama, role_jabatan, jk, status, jarak_meter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const seedTx = db.transaction(() => {
        const today = new Date();
        for (let i = 30; i >= 1; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const dayOfWeek = d.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip Saturdays & Sundays

          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;

          // Staff attendance
          for (const s of allStaff) {
            const timeMin = 30 + ((i * 3 + s.nama.length) % 25);
            const timeStr = `06:${String(timeMin).padStart(2, '0')}`;
            const jarak = `${20 + ((i * 5) % 45)}m (Radius Valid)`;
            insertPegawaiAbsen.run(dateStr, timeStr, s.nis_nip, s.nama, s.role, s.jk || 'L', 'Hadir', jarak);
          }

          // Student attendance
          for (let sIdx = 0; sIdx < allStudents.length; sIdx++) {
            const st = allStudents[sIdx];
            const hash = (sIdx * 37 + i * 19) % 100;
            let status = 'Hadir';
            if (hash < 3) status = 'Sakit';
            else if (hash < 6) status = 'Izin';
            else if (hash < 8) status = 'Alpa';

            if (status === 'Hadir') {
              const timeMin = 35 + ((sIdx + i) % 25);
              const timeStr = `06:${String(timeMin).padStart(2, '0')}`;
              const jarak = `${15 + ((sIdx * 7) % 75)}m`;
              insertSiswaAbsen.run(dateStr, timeStr, st.nis, st.nama, st.kelas, st.jurusan, st.jk, status, jarak);
            } else if (hash < 8) {
              insertSiswaAbsen.run(dateStr, '07:00', st.nis, st.nama, st.kelas, st.jurusan, st.jk, status, 'Surat Keterangan');
            }
          }
        }
      });

      seedTx();
    }
  }
}

export function importStudentsFromCsvContent(csvContent: string): { importedCount: number; skippedCount: number } {
  const lines = String(csvContent || '').split(/\r?\n/);
  const upsert = db.prepare(`
    INSERT INTO siswa (
      nis, nama, kelas, jurusan, jk, tempat_pkl,
      nilai_sm1, nilai_sm2, status_sm1, status_sm2, tugas_belum_sm1, tugas_belum_sm2
    ) VALUES (?, ?, ?, ?, ?, '-', '-', '-', '-', '-', '-', '-')
    ON CONFLICT(nis) DO UPDATE SET
      nama = excluded.nama,
      kelas = excluded.kelas,
      jurusan = excluded.jurusan,
      jk = excluded.jk
  `);

  let importedCount = 0;
  let skippedCount = 0;

  const tx = db.transaction(() => {
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;
      const cols = rawLine.split(',').map((c) => c.trim());
      const nis = cols[0] || '';
      const nama = cols[1] || '';
      const kelas = cols[2] || '';
      const jurusan = cols[3] || 'Teknik Jaringan Komputer';
      const jkRaw = cols[4] || 'L';

      // Skip header row or empty comma lines
      if (!nis || !nama || !kelas || nis.toUpperCase() === 'NIS') {
        if (nis && nis.toUpperCase() !== 'NIS') skippedCount++;
        continue;
      }

      let jk = 'L';
      const jkLower = jkRaw.toLowerCase();
      if (jkLower.startsWith('p') || jkLower.includes('perempuan')) {
        jk = 'P';
      } else if (jkLower.startsWith('l') || jkLower.includes('laki')) {
        jk = 'L';
      }

      upsert.run(nis, nama, kelas, jurusan, jk);
      importedCount++;
    }
  });

  tx();
  return { importedCount, skippedCount };
}

export function isAdminClaimed(): boolean {
  if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
    return true;
  }
  const meta = db.prepare("SELECT value FROM auth_meta WHERE key = 'admin_claimed'").get() as { value: string } | undefined;
  if (meta?.value === 'true') return true;
  const adminRow = db.prepare("SELECT password_hash FROM users WHERE role = 'admin' LIMIT 1").get() as
    | { password_hash: string }
    | undefined;
  return Boolean(adminRow?.password_hash);
}
