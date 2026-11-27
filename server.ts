import dotenv from 'dotenv';
dotenv.config({ override: true });
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  db,
  hashPassword,
  importStudentsFromCsvContent,
  initDatabase,
  isAdminClaimed,
  UPLOAD_DIR,
  verifyPasswordHash,
} from './server/db.ts';
import {
  deleteRecordFromMysql,
  generateMysqlDumpSql,
  isMysqlConfigured,
  MYSQL_SCHEMA_SQL,
  PHP_CONNECTION_TEMPLATE,
  syncAllFromSqliteToMysql,
  syncRecordToMysql,
  testMysqlConnection,
} from './server/mysqlSync.ts';
import {
  isSupabaseConfigured,
  SUPABASE_SQL_SCHEMA,
  syncRecordToSupabase,
} from './server/supabaseSync.ts';
import {
  getNamaHariWIB,
  getTimeWIB,
  getTodayWIB,
  hitungJarakMeter,
  JAM_KBM_MATRIX,
  parseJamKeRangeFromJadwal,
  SESI_WAKTU_SEKOLAH,
  timeToMinutes,
} from './src/shared/scheduleConstants.ts';
import type {
  AttendanceStatus,
  AuthUser,
  JenjangSekolah,
  KalenderRecord,
  PengaturanSekolah,
  UserRole,
} from './src/shared/types.ts';

initDatabase();

function getOrCreateSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  const row = db.prepare("SELECT value FROM auth_meta WHERE key = 'session_secret'").get() as
    | { value: string }
    | undefined;
  if (row?.value) return row.value;
  const generated = crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT OR IGNORE INTO auth_meta (key, value) VALUES ('session_secret', ?)").run(generated);
  const stored = db.prepare("SELECT value FROM auth_meta WHERE key = 'session_secret'").get() as { value: string };
  return stored.value;
}

const rawPort = process.env.PORT?.trim();
const PORT: number | string =
  process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev'
    ? 3000
    : rawPort
      ? /^\d+$/.test(rawPort)
        ? Number(rawPort)
        : rawPort
      : 3000;
const SESSION_SECRET = getOrCreateSessionSecret();
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface SessionPayload {
  id: number;
  username: string;
  role: UserRole;
  nama: string;
  nisNip: string;
  kelas: string;
  jurusan?: string;
  jk: string;
  exp: number;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

function signToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeJenjang(raw?: unknown, namaSekolah?: unknown): JenjangSekolah {
  const val = String(raw || '').trim().toUpperCase();
  if (val === 'SMA' || val === 'SMP' || val === 'SMK') return val;
  const nama = String(namaSekolah || '').trim().toUpperCase();
  if (nama.includes('SMP')) return 'SMP';
  if (nama.includes('SMA')) return 'SMA';
  return 'SMK';
}

function getPengaturan(): PengaturanSekolah {
  const row = db.prepare('SELECT * FROM pengaturan WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    return {
      namaSekolah: 'SMK KP BALEENDAH',
      alamatSekolah: 'Jl. Adipati Agung No. 32 Baleendah - Kab. Bandung',
      tahunAjaran: '2026/2027',
      jenjangSekolah: 'SMK',
      namaWalikelas: 'Wali Kelas Default',
      kelasAmpu: 'X TJKT 1',
      latGps: -7.001759,
      lngGps: 107.623047,
      radiusMeter: 100,
      footerApp: '© 2026 TIM IT SMK KP BALEENDAH - SISTEM INTEGRASI SEKOLAH',
      logoSekolah: '',
    };
  }
  const namaSekolah = String(row.nama_sekolah || 'SMK KP BALEENDAH');
  return {
    namaSekolah,
    alamatSekolah: String(row.alamat_sekolah || ''),
    tahunAjaran: String(row.tahun_ajaran || '2026/2027'),
    jenjangSekolah: normalizeJenjang(row.jenjang_sekolah, namaSekolah),
    namaWalikelas: String(row.nama_walikelas || ''),
    kelasAmpu: String(row.kelas_ampu || ''),
    latGps: Number(row.lat_gps) || -7.001759,
    lngGps: Number(row.lng_gps) || 107.623047,
    radiusMeter: Number(row.radius_meter) || 100,
    footerApp: String(row.footer_app || ''),
    logoSekolah: String(row.logo_sekolah || ''),
  };
}

function getKalenderByDate(dateStr: string): KalenderRecord {
  const cleanTarget = String(dateStr || getTodayWIB()).trim().substring(0, 10);
  const row = db.prepare('SELECT * FROM kalender_pendidikan WHERE tanggal = ?').get(cleanTarget) as
    | Record<string, unknown>
    | undefined;
  if (row) {
    const modeKbm = String(row.mode_kbm || 'Luring') as 'Luring' | 'Daring' | 'Libur';
    const statusEfektif = String(row.status_efektif || 'Efektif') as 'Efektif' | 'Tidak Efektif';
    return {
      id: Number(row.id),
      tanggal: cleanTarget,
      modeKbm,
      statusEfektif,
      jamMulai: String(row.jam_mulai || '06:30'),
      jamSelesai: String(row.jam_selesai || '16:00'),
      keterangan: String(row.keterangan || ''),
      wajibGps: modeKbm.toLowerCase() === 'luring' && statusEfektif.toLowerCase() === 'efektif',
    };
  }

  const parts = cleanTarget.split('-');
  let weekendDay = 0;
  let isWeekend = false;
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    weekendDay = d.getDay();
    isWeekend = weekendDay === 0 || weekendDay === 6;
  }

  if (isWeekend) {
    const namaHari = weekendDay === 6 ? 'Sabtu' : 'Minggu';
    return {
      id: 0,
      tanggal: cleanTarget,
      modeKbm: 'Libur',
      statusEfektif: 'Tidak Efektif',
      jamMulai: '-',
      jamSelesai: '-',
      keterangan: `Hari ${namaHari} (Libur Akhir Pekan / Tidak Efektif KBM)`,
      wajibGps: false,
    };
  }

  return {
    id: 0,
    tanggal: cleanTarget,
    modeKbm: 'Luring',
    statusEfektif: 'Efektif',
    jamMulai: '06:30',
    jamSelesai: '16:00',
    keterangan: 'KBM Luring Reguler (Wajib Radius GPS Sekolah)',
    wajibGps: true,
  };
}

function sanitizeFileName(rawName: string): string {
  const base = String(rawName || 'dokumen_tugas')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (base || 'tugas').substring(0, 50);
}

function validateMagicBytes(buf: Buffer, mimeType: string): boolean {
  if (!buf || buf.length < 8) return false;
  if (mimeType === 'application/pdf') {
    return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  }
  if (mimeType === 'application/msword') {
    return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  }
  if (mimeType === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    return (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    );
  }
  return false;
}

function computeLiveRombelStatus() {
  const todayStr = getTodayWIB();
  const todayHari = getNamaHariWIB(todayStr);
  const nowHHMM = getTimeWIB().substring(0, 5);
  const nowMin = timeToMinutes(nowHHMM);
  const kalender = getKalenderByDate(todayStr);

  const kelasRows = db
    .prepare(
      `SELECT DISTINCT kelas FROM (
         SELECT kelas FROM siswa
         UNION
         SELECT kelas FROM jadwal_pelajaran
       ) WHERE kelas IS NOT NULL AND TRIM(kelas) != '' ORDER BY kelas ASC`
    )
    .all() as Array<{ kelas: string }>;

  const jadwalToday = db
    .prepare('SELECT * FROM jadwal_pelajaran WHERE LOWER(hari) = LOWER(?)')
    .all(todayHari) as Array<Record<string, unknown>>;

  const hadirPegawaiToday = db
    .prepare('SELECT * FROM kehadiran_pegawai WHERE tgl_absen = ?')
    .all(todayStr) as Array<Record<string, unknown>>;

  const jurnalToday = db
    .prepare('SELECT * FROM jurnal_harian WHERE tanggal = ?')
    .all(todayStr) as Array<Record<string, unknown>>;

  const currentSession = SESI_WAKTU_SEKOLAH.find((sesi) => {
    const sMin = timeToMinutes(sesi.mulai);
    const eMin = timeToMinutes(sesi.selesai);
    return nowMin >= sMin && nowMin < eMin;
  });

  const rombels = kelasRows.map(({ kelas }) => {
    const jadwalKelas = jadwalToday.filter((j) => String(j.kelas) === kelas);

    if (
      kalender.modeKbm.toLowerCase() === 'libur' ||
      kalender.statusEfektif.toLowerCase() === 'tidak efektif'
    ) {
      return {
        kelas,
        status: 'OFF',
        colorState: 'gray' as const,
        guru: '-',
        mapel: kalender.keterangan || 'Libur / Tidak Efektif',
        jamKe: '-',
        ruang: '-',
        guruCheckedIn: false,
        jurnalFilled: false,
      };
    }

    if (currentSession?.tipe === 'ISTIRAHAT') {
      return {
        kelas,
        status: 'Istirahat',
        colorState: 'gray' as const,
        guru: '-',
        mapel: currentSession.label || 'Waktu Istirahat',
        jamKe: `${currentSession.mulai} - ${currentSession.selesai} WIB`,
        ruang: '-',
        guruCheckedIn: false,
        jurnalFilled: false,
      };
    }

    if (currentSession?.tipe === 'KBM' && currentSession.jamKe) {
      const aktifJamKe = currentSession.jamKe;
      const found = jadwalKelas.find((j) => {
        const range = parseJamKeRangeFromJadwal(String(j.jam || ''));
        return range.start !== null && range.end !== null && aktifJamKe >= range.start && aktifJamKe <= range.end;
      });

      if (!found || !String(found.guru || '').trim() || String(found.guru).trim() === '-') {
        return {
          kelas,
          status: 'Tidak Ada Guru',
          colorState: 'red' as const,
          guru: '-',
          mapel: 'Tidak ada guru mengajar / Jam kosong',
          jamKe: `Jam ke-${aktifJamKe} (${currentSession.mulai} - ${currentSession.selesai} WIB)`,
          ruang: '-',
          guruCheckedIn: false,
          jurnalFilled: false,
        };
      }

      const guruName = String(found.guru).trim();
      const mapelName = String(found.mapel || '-').trim();
      const range = parseJamKeRangeFromJadwal(String(found.jam || ''));
      const jamKeDisplay = `${range.label} (${range.startTime || currentSession.mulai} - ${range.endTime || currentSession.selesai} WIB)`;
      const startMin = timeToMinutes(range.startTime || currentSession.mulai);
      const elapsedSinceStart = nowMin - startMin;

      const guruCheckedIn = hadirPegawaiToday.some(
        (p) =>
          (String(p.status) === 'Hadir' || String(p.status) === 'Terlambat') &&
          String(p.nama).trim().toLowerCase() === guruName.toLowerCase()
      );
      const jurnalFilled = jurnalToday.some((jr) => {
        if (
          String(jr.kelas) !== kelas ||
          String(jr.mapel).trim().toLowerCase() !== mapelName.toLowerCase() ||
          String(jr.guru_nama).trim().toLowerCase() !== guruName.toLowerCase()
        ) {
          return false;
        }
        const jrRange = parseJamKeRangeFromJadwal(String(jr.jam_ke || ''));
        if (jrRange.start !== null && jrRange.end !== null) {
          return aktifJamKe >= jrRange.start && aktifJamKe <= jrRange.end;
        }
        return true;
      });

      if (jurnalFilled) {
        return {
          kelas,
          status: 'Sedang KBM',
          colorState: 'green' as const,
          guru: guruName,
          mapel: mapelName,
          jamKe: jamKeDisplay,
          ruang: String(found.ruang || '-'),
          guruCheckedIn,
          jurnalFilled: true,
        };
      }

      if (elapsedSinceStart >= 0 && elapsedSinceStart < 5) {
        return {
          kelas,
          status: 'Menunggu Jurnal (5 Menit Awal)',
          colorState: 'yellow' as const,
          guru: guruName,
          mapel: mapelName,
          jamKe: jamKeDisplay,
          ruang: String(found.ruang || '-'),
          guruCheckedIn,
          jurnalFilled: false,
        };
      }

      if (guruCheckedIn) {
        return {
          kelas,
          status: 'Sedang KBM',
          colorState: 'green' as const,
          guru: guruName,
          mapel: mapelName,
          jamKe: jamKeDisplay,
          ruang: String(found.ruang || '-'),
          guruCheckedIn: true,
          jurnalFilled: false,
        };
      }

      return {
        kelas,
        status: 'Tidak Ada Guru',
        colorState: 'red' as const,
        guru: '-',
        mapel: `${mapelName} (Guru belum hadir/jurnal: ${guruName})`,
        jamKe: jamKeDisplay,
        ruang: String(found.ruang || '-'),
        guruCheckedIn: false,
        jurnalFilled: false,
      };
    }

    // Outside 07:00 - 15:15 WIB: show today's schedule summary in OFF state
    return {
      kelas,
      status: 'OFF',
      colorState: 'gray' as const,
      guru: '-',
      mapel:
        jadwalKelas.length > 0
          ? `Di luar jam KBM (${jadwalKelas.length} sesi terjadwal hari ini)`
          : 'Di luar jam efektif KBM (07:00 - 15:15 WIB)',
      jamKe: '-',
      ruang: '-',
      guruCheckedIn: false,
      jurnalFilled: false,
    };
  });

  return {
    todayStr,
    todayHari,
    timeStr: getTimeWIB(),
    currentSessionLabel: currentSession
      ? currentSession.tipe === 'ISTIRAHAT'
        ? currentSession.label || 'Istirahat'
        : `Jam ke-${currentSession.jamKe}`
      : 'Di Luar Jam KBM',
    kalender,
    kelasList: kelasRows.map((r) => r.kelas),
    jadwalToday: jadwalToday.map((j) => ({
      id: Number(j.id),
      hari: String(j.hari),
      jam: String(j.jam),
      kelas: String(j.kelas),
      mapel: String(j.mapel),
      guru: String(j.guru),
      ruang: String(j.ruang),
    })),
    hadirPegawaiToday: hadirPegawaiToday.map((p) => ({
      nama: String(p.nama),
      status: String(p.status),
      waktuInput: String(p.waktu_input),
    })),
    jurnalToday: jurnalToday.map((jr) => ({
      kelas: String(jr.kelas),
      mapel: String(jr.mapel),
      guruNama: String(jr.guru_nama),
      jamKe: String(jr.jam_ke),
    })),
    rombels,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  const allowedOrigins = String(process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use('/api', (req, res, next) => {
    const reqOrigin = req.headers.origin;
    if (allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (reqOrigin && allowedOrigins.includes(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Access-Token');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastUpdate = (scope: string) => {
    const msg = JSON.stringify({ type: 'DATA_UPDATED', scope, timestamp: Date.now() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() }));
  });

  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const altHeader = req.headers['x-access-token'];
    const token =
      header && header.startsWith('Bearer ')
        ? header.slice(7).trim()
        : typeof altHeader === 'string'
          ? altHeader.trim()
          : '';
    if (!token) {
      res.status(401).json({ status: false, message: 'Sesi login diperlukan.' });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ status: false, message: 'Sesi login berakhir. Silakan masuk ulang.' });
      return;
    }
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      nama: payload.nama,
      nisNip: payload.nisNip,
      kelas: payload.kelas,
      jurusan: payload.jurusan,
      jk: payload.jk,
    };
    next();
  };

  const requireRole = (roles: UserRole[]) => (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ status: false, message: 'Akses ditolak untuk peran Anda.' });
      return;
    }
    next();
  };

  // === PUBLIC META & AUTH ===
  app.get('/api/public/meta', (_req, res) => {
    const todayStr = getTodayWIB();
    res.json({
      adminClaimed: isAdminClaimed(),
      mysqlConfigured: isMysqlConfigured(),
      supabaseConfigured: isSupabaseConfigured(),
      firebaseConfigured: true,
      pengaturan: getPengaturan(),
      kalenderHariIni: getKalenderByDate(todayStr),
      serverTime: {
        todayStr,
        timeStr: getTimeWIB(),
        hhmmStr: getTimeWIB().substring(0, 5),
        timestampMs: Date.now(),
      },
    });
  });

  app.post('/api/auth/claim-admin', (req, res) => {
    if (isAdminClaimed()) {
      res.status(403).json({ status: false, message: 'Akun Admin sudah diaktivasi sebelumnya.' });
      return;
    }
    const adminPassword = String(req.body?.adminPassword || '').trim();
    const staffPassword = String(req.body?.staffPassword || '').trim();
    if (adminPassword.length < 6) {
      res.status(400).json({ status: false, message: 'Password Admin minimal 6 karakter.' });
      return;
    }

    const adminHash = hashPassword(adminPassword);
    const tx = db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ? WHERE username = 'admin'").run(adminHash);
      if (staffPassword.length >= 4) {
        const staffHash = hashPassword(staffPassword);
        db.prepare("UPDATE users SET password_hash = ? WHERE role IN ('guru', 'karyawan')").run(staffHash);
      }
      db.prepare("INSERT OR REPLACE INTO auth_meta (key, value) VALUES ('admin_claimed', 'true')").run();
    });
    tx();
    if (isMysqlConfigured()) {
      void syncAllFromSqliteToMysql(db);
    }

    const adminRow = db.prepare("SELECT * FROM users WHERE username = 'admin'").get() as Record<string, unknown>;
    const user: AuthUser = {
      id: Number(adminRow.id),
      username: String(adminRow.username),
      role: 'admin',
      nama: String(adminRow.nama),
      nisNip: String(adminRow.nis_nip),
      kelas: String(adminRow.kelas),
      jk: String(adminRow.jk),
    };
    const token = signToken({ ...user, exp: Date.now() + 12 * 60 * 60 * 1000 });
    res.json({ status: true, token, user });
  });

  app.post('/api/auth/login', (req, res) => {
    const inputVal = String(req.body?.username || '').trim();
    const inputPass = String(req.body?.password || '').trim();

    if (!inputVal) {
      res.status(400).json({ status: false, message: 'Masukkan NIS atau Username.' });
      return;
    }

    // 1. Cek Siswa by NIS
    const siswaRow = db
      .prepare('SELECT * FROM siswa WHERE LOWER(TRIM(nis)) = LOWER(?)')
      .get(inputVal) as Record<string, unknown> | undefined;
    if (siswaRow) {
      const user: AuthUser = {
        id: Number(siswaRow.id),
        username: String(siswaRow.nis),
        role: 'siswa',
        nama: String(siswaRow.nama),
        nisNip: String(siswaRow.nis),
        kelas: String(siswaRow.kelas),
        jurusan: String(siswaRow.jurusan),
        jk: String(siswaRow.jk),
        tempatPkl: String(siswaRow.tempat_pkl),
        nilaiSm1: String(siswaRow.nilai_sm1),
        nilaiSm2: String(siswaRow.nilai_sm2),
        statusSm1: String(siswaRow.status_sm1),
        statusSm2: String(siswaRow.status_sm2),
        tugasBelumSm1: String(siswaRow.tugas_belum_sm1),
        tugasBelumSm2: String(siswaRow.tugas_belum_sm2),
      };
      const token = signToken({ ...user, exp: Date.now() + 12 * 60 * 60 * 1000 });
      res.json({ status: true, token, user });
      return;
    }

    // 2. Cek Pegawai / Admin (via username atau NIP)
    const userRow = db
      .prepare('SELECT * FROM users WHERE LOWER(TRIM(username)) = LOWER(?) OR LOWER(TRIM(nis_nip)) = LOWER(?) LIMIT 1')
      .get(inputVal, inputVal) as Record<string, unknown> | undefined;
    if (!userRow) {
      res.status(401).json({ status: false, message: 'NIS atau Username tidak ditemukan. Pastikan penulisan benar.' });
      return;
    }

    if (!inputPass) {
      res.status(401).json({ status: false, message: 'Masukkan kata sandi untuk akun Admin, Guru, atau Karyawan.' });
      return;
    }

    const role = String(userRow.role).toLowerCase() as UserRole;
    const storedHash = String(userRow.password_hash || '');
    let passwordValid = false;

    if (role === 'admin' && process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
      const envPass = Buffer.from(process.env.ADMIN_PASSCODE.trim());
      const provided = Buffer.from(inputPass);
      const matchesEnv = envPass.length === provided.length && crypto.timingSafeEqual(envPass, provided);
      const matchesDb = storedHash ? verifyPasswordHash(inputPass, storedHash) : false;
      passwordValid = matchesEnv || matchesDb;
    } else {
      passwordValid = verifyPasswordHash(inputPass, storedHash);
    }

    if (!passwordValid) {
      res.status(401).json({ status: false, message: 'Kata sandi salah. Periksa kembali password Anda.' });
      return;
    }

    const user: AuthUser = {
      id: Number(userRow.id),
      username: String(userRow.username),
      role,
      nama: String(userRow.nama),
      nisNip: String(userRow.nis_nip),
      kelas: String(userRow.kelas),
      jk: String(userRow.jk),
    };
    const token = signToken({ ...user, exp: Date.now() + 12 * 60 * 60 * 1000 });
    res.json({ status: true, token, user });
  });

  // === BOOTSTRAP DATA (ROLE-SCOPED) ===
  app.get('/api/bootstrap', requireAuth, (req: AuthedRequest, res) => {
    const user = req.user!;
    const todayStr = getTodayWIB();
    const pengaturan = getPengaturan();
    const kalenderHariIni = getKalenderByDate(todayStr);
    const mapel = (db.prepare('SELECT nama FROM master_mapel ORDER BY nama ASC').all() as Array<{ nama: string }>).map(
      (r) => r.nama
    );
    const hakAkses = (db.prepare('SELECT * FROM hak_akses_role').all() as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      nama: String(r.nama),
      admin: Boolean(r.admin),
      guru: Boolean(r.guru),
      karyawan: Boolean(r.karyawan),
      siswa: Boolean(r.siswa),
    }));
    const kalender = (db.prepare('SELECT * FROM kalender_pendidikan ORDER BY tanggal DESC').all() as Array<Record<string, unknown>>).map(
      (r) => ({
        id: Number(r.id),
        tanggal: String(r.tanggal),
        modeKbm: String(r.mode_kbm) as 'Luring' | 'Daring' | 'Libur',
        statusEfektif: String(r.status_efektif) as 'Efektif' | 'Tidak Efektif',
        jamMulai: String(r.jam_mulai),
        jamSelesai: String(r.jam_selesai),
        keterangan: String(r.keterangan),
      })
    );
    const agenda = (db.prepare('SELECT * FROM agenda_akademik ORDER BY tanggal DESC, id DESC').all() as Array<Record<string, unknown>>).map(
      (r) => ({
        id: Number(r.id),
        tanggal: String(r.tanggal),
        judul: String(r.judul),
        kategori: String(r.kategori),
        keterangan: String(r.keterangan),
      })
    );
    const jurusan = (db.prepare('SELECT * FROM data_jurusan ORDER BY kode ASC').all() as Array<Record<string, unknown>>).map(
      (r) => ({
        id: Number(r.id),
        kode: String(r.kode),
        nama: String(r.nama),
        kurikulum: String(r.kurikulum),
        fasilitas: String(r.fasilitas),
      })
    );

    if (user.role === 'siswa') {
      const kehadiran = (
        db.prepare('SELECT * FROM kehadiran_siswa WHERE LOWER(nis) = LOWER(?) ORDER BY tgl_absen DESC, id DESC').all(user.nisNip) as Array<
          Record<string, unknown>
        >
      ).map((r) => ({
        id: Number(r.id),
        tglAbsen: String(r.tgl_absen),
        waktuInput: String(r.waktu_input),
        nis: String(r.nis),
        nama: String(r.nama),
        kelas: String(r.kelas),
        jurusan: String(r.jurusan),
        jk: String(r.jk),
        status: String(r.status) as AttendanceStatus,
        jarakMeter: String(r.jarak_meter),
      }));

      const pembinaan = (
        db.prepare('SELECT * FROM pembinaan_siswa WHERE LOWER(nis) = LOWER(?) ORDER BY id DESC').all(user.nisNip) as Array<
          Record<string, unknown>
        >
      ).map((r) => ({
        id: Number(r.id),
        waktuInput: String(r.waktu_input),
        tanggal: String(r.tanggal),
        nis: String(r.nis),
        nama: String(r.nama),
        kelas: String(r.kelas),
        guruPembina: String(r.guru_pembina),
        jenis: String(r.jenis),
        poin: Number(r.poin),
        uraian: String(r.uraian),
        solusi: String(r.solusi),
      }));

      const historiTugas = (
        db.prepare('SELECT * FROM pengumpulan_tugas WHERE LOWER(nis) = LOWER(?) ORDER BY waktu_pengiriman DESC').all(
          user.nisNip
        ) as Array<Record<string, unknown>>
      ).map((r) => ({
        idPengumpulan: String(r.id_pengumpulan),
        waktuPengiriman: String(r.waktu_pengiriman),
        nis: String(r.nis),
        namaSiswa: String(r.nama_siswa),
        kelas: String(r.kelas),
        tanggalTugas: String(r.tanggal_tugas),
        mapel: String(r.mapel),
        keterangan: String(r.keterangan),
        namaFile: String(r.nama_file),
        status: String(r.status),
        nilaiTugas: String(r.nilai_tugas || ''),
        catatanNilai: String(r.catatan_nilai || ''),
      }));

      // Master Jadwal Kelas: siswa hanya melihat jadwal kelasnya sendiri
      const jadwal = (
        db.prepare('SELECT * FROM jadwal_pelajaran WHERE kelas = ? ORDER BY id ASC').all(user.kelas) as Array<
          Record<string, unknown>
        >
      ).map((r) => ({
        id: Number(r.id),
        hari: String(r.hari),
        jam: String(r.jam),
        kelas: String(r.kelas),
        mapel: String(r.mapel),
        guru: String(r.guru),
        ruang: String(r.ruang),
      }));

      const nilaiSiswa = (
        db
          .prepare('SELECT * FROM nilai_siswa WHERE LOWER(nis) = LOWER(?) ORDER BY tahun_ajaran DESC, semester ASC, mapel ASC')
          .all(user.nisNip) as Array<Record<string, unknown>>
      ).map((r) => ({
        id: Number(r.id),
        tahunAjaran: String(r.tahun_ajaran),
        semester: String(r.semester),
        nis: String(r.nis),
        mapel: String(r.mapel),
        nilai: Number(r.nilai) || 0,
        status: String(r.status || 'Belum Tuntas'),
        catatan: String(r.catatan || ''),
        guruNama: String(r.guru_nama || ''),
        updatedAt: String(r.updated_at || ''),
      }));

      res.json({
        authenticated: true,
        adminClaimed: isAdminClaimed(),
        mysqlConfigured: isMysqlConfigured(),
        supabaseConfigured: isSupabaseConfigured(),
        firebaseConfigured: true,
        serverTime: {
          todayStr,
          timeStr: getTimeWIB(),
          hhmmStr: getTimeWIB().substring(0, 5),
          timestampMs: Date.now(),
        },
        pengaturan,
        kalenderHariIni,
        mapel,
        siswa: [],
        kehadiran,
        kehadiranPegawai: [],
        historiTugas,
        pembinaan,
        jurnal: [],
        users: [],
        jurusan,
        jadwal,
        agenda,
        kalender,
        nilaiSiswa,
        hakAkses,
      });
      return;
    }

    // Staff: Admin, Guru, Karyawan
    const siswa = (db.prepare('SELECT * FROM siswa ORDER BY kelas ASC, nama ASC').all() as Array<Record<string, unknown>>).map(
      (r) => ({
        id: Number(r.id),
        nis: String(r.nis),
        nama: String(r.nama),
        kelas: String(r.kelas),
        jurusan: String(r.jurusan),
        jk: String(r.jk),
        tempatPkl: String(r.tempat_pkl || '-'),
        nilaiSm1: String(r.nilai_sm1 || '-'),
        nilaiSm2: String(r.nilai_sm2 || '-'),
        statusSm1: String(r.status_sm1 || '-'),
        statusSm2: String(r.status_sm2 || '-'),
        tugasBelumSm1: String(r.tugas_belum_sm1 || '-'),
        tugasBelumSm2: String(r.tugas_belum_sm2 || '-'),
      })
    );

    const kehadiran = (
      db.prepare('SELECT * FROM kehadiran_siswa ORDER BY tgl_absen DESC, id DESC LIMIT 5000').all() as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      tglAbsen: String(r.tgl_absen),
      waktuInput: String(r.waktu_input),
      nis: String(r.nis),
      nama: String(r.nama),
      kelas: String(r.kelas),
      jurusan: String(r.jurusan),
      jk: String(r.jk),
      status: String(r.status) as AttendanceStatus,
      jarakMeter: String(r.jarak_meter),
    }));

    const kehadiranPegawaiQuery =
      user.role === 'admin' || user.role === 'karyawan' || user.role === 'guru'
        ? db.prepare('SELECT * FROM kehadiran_pegawai ORDER BY tgl_absen DESC, id DESC LIMIT 1000').all()
        : db
            .prepare(
              'SELECT * FROM kehadiran_pegawai WHERE LOWER(nip_user) = LOWER(?) OR LOWER(nip_user) = LOWER(?) OR LOWER(nama) = LOWER(?) ORDER BY tgl_absen DESC, id DESC'
            )
            .all(user.username, user.nisNip, user.nama);

    const kehadiranPegawai = (kehadiranPegawaiQuery as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      tglAbsen: String(r.tgl_absen),
      waktuInput: String(r.waktu_input),
      nipUser: String(r.nip_user),
      nama: String(r.nama),
      roleJabatan: String(r.role_jabatan),
      jk: String(r.jk),
      status: String(r.status) as AttendanceStatus,
      jarakMeter: String(r.jarak_meter),
    }));

    const pembinaan = (db.prepare('SELECT * FROM pembinaan_siswa ORDER BY id DESC').all() as Array<Record<string, unknown>>).map(
      (r) => ({
        id: Number(r.id),
        waktuInput: String(r.waktu_input),
        tanggal: String(r.tanggal),
        nis: String(r.nis),
        nama: String(r.nama),
        kelas: String(r.kelas),
        guruPembina: String(r.guru_pembina),
        jenis: String(r.jenis),
        poin: Number(r.poin),
        uraian: String(r.uraian),
        solusi: String(r.solusi),
      })
    );

    const jurnalQuery =
      user.role === 'admin'
        ? db.prepare('SELECT * FROM jurnal_harian ORDER BY id DESC').all()
        : db.prepare('SELECT * FROM jurnal_harian WHERE LOWER(guru_nama) = LOWER(?) ORDER BY id DESC').all(user.nama);

    const jurnal = (jurnalQuery as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      waktuInput: String(r.waktu_input),
      tanggal: String(r.tanggal),
      guruNama: String(r.guru_nama),
      jamKe: String(r.jam_ke),
      kelas: String(r.kelas),
      mapel: String(r.mapel),
      tujuan: String(r.tujuan),
      materi: String(r.materi),
      metode: String(r.metode),
      refleksi: String(r.refleksi),
      tugas: String(r.tugas),
      nilaiProgres: String(r.nilai_progres),
      fotoUrl: String(r.foto_url),
    }));

    // Master Jadwal Kelas: hanya keluar sesuai USER yang login kecuali ADMIN All AKSES
    const jadwalQuery =
      user.role === 'admin'
        ? db.prepare('SELECT * FROM jadwal_pelajaran ORDER BY hari ASC, id ASC').all()
        : db
            .prepare('SELECT * FROM jadwal_pelajaran WHERE LOWER(guru) = LOWER(?) ORDER BY hari ASC, id ASC')
            .all(user.nama);

    const jadwal = (jadwalQuery as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      hari: String(r.hari),
      jam: String(r.jam),
      kelas: String(r.kelas),
      mapel: String(r.mapel),
      guru: String(r.guru),
      ruang: String(r.ruang),
    }));

    const users =
      user.role === 'admin'
        ? (db.prepare('SELECT id, username, role, nama, nis_nip, kelas, jk FROM users ORDER BY id ASC').all() as Array<
            Record<string, unknown>
          >).map((r) => ({
            id: Number(r.id),
            username: String(r.username),
            role: String(r.role) as UserRole,
            nama: String(r.nama),
            nisNip: String(r.nis_nip),
            kelas: String(r.kelas),
            jk: String(r.jk),
          }))
        : [];

    const historiTugas =
      user.role === 'admin'
        ? (
            db.prepare('SELECT * FROM pengumpulan_tugas ORDER BY waktu_pengiriman DESC').all() as Array<Record<string, unknown>>
          ).map((r) => ({
            idPengumpulan: String(r.id_pengumpulan),
            waktuPengiriman: String(r.waktu_pengiriman),
            nis: String(r.nis),
            namaSiswa: String(r.nama_siswa),
            kelas: String(r.kelas),
            tanggalTugas: String(r.tanggal_tugas),
            mapel: String(r.mapel),
            keterangan: String(r.keterangan),
            namaFile: String(r.nama_file),
            status: String(r.status),
            nilaiTugas: String(r.nilai_tugas || ''),
            catatanNilai: String(r.catatan_nilai || ''),
          }))
        : [];

    const nilaiSiswa = (
      db.prepare('SELECT * FROM nilai_siswa ORDER BY updated_at DESC, id DESC').all() as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      tahunAjaran: String(r.tahun_ajaran),
      semester: String(r.semester),
      nis: String(r.nis),
      mapel: String(r.mapel),
      nilai: Number(r.nilai) || 0,
      status: String(r.status || 'Belum Tuntas'),
      catatan: String(r.catatan || ''),
      guruNama: String(r.guru_nama || ''),
      updatedAt: String(r.updated_at || ''),
    }));

    res.json({
      authenticated: true,
      adminClaimed: isAdminClaimed(),
      mysqlConfigured: isMysqlConfigured(),
      supabaseConfigured: isSupabaseConfigured(),
      firebaseConfigured: true,
      serverTime: {
        todayStr,
        timeStr: getTimeWIB(),
        hhmmStr: getTimeWIB().substring(0, 5),
        timestampMs: Date.now(),
      },
      pengaturan,
      kalenderHariIni,
      mapel,
      siswa,
      kehadiran,
      kehadiranPegawai,
      historiTugas,
      pembinaan,
      jurnal,
      users,
      jurusan,
      jadwal,
      agenda,
      kalender,
      nilaiSiswa,
      hakAkses,
    });
  });

  // === LIVE DASHBOARD KEHADIRAN GURU & STATUS ROMBEL ===
  app.get('/api/live-rombel', requireAuth, requireRole(['admin', 'guru', 'karyawan']), (_req, res) => {
    res.json({ status: true, data: computeLiveRombelStatus() });
  });

  // === PRESENSI GPS (LOCKED ONCE CHECKED IN TODAY) ===
  app.post('/api/presensi/gps', requireAuth, async (req: AuthedRequest, res) => {
    const user = req.user!;
    const todayStr = getTodayWIB();
    const waktuFormatted = getTimeWIB().substring(0, 5);
    const kalender = getKalenderByDate(todayStr);

    if (kalender.statusEfektif.toLowerCase() === 'tidak efektif' || kalender.modeKbm.toLowerCase() === 'libur') {
      res.status(400).json({
        status: false,
        message: `Presensi ditutup. Hari ini terjadwal ${kalender.modeKbm} (${kalender.statusEfektif}).`,
      });
      return;
    }

    // Lock check: Jika sudah absen GPS hari ini, tombol/endpoint tidak boleh memperbarui jam absen
    if (user.role === 'siswa') {
      const existing = db
        .prepare('SELECT * FROM kehadiran_siswa WHERE tgl_absen = ? AND LOWER(nis) = LOWER(?)')
        .get(todayStr, user.nisNip) as Record<string, unknown> | undefined;
      if (existing) {
        res.status(409).json({
          status: false,
          alreadyCheckedIn: true,
          message: `Anda sudah melakukan Presensi pada pukul ${existing.waktu_input} WIB. Jam absen terkunci.`,
        });
        return;
      }
    } else {
      const existing = db
        .prepare(
          'SELECT * FROM kehadiran_pegawai WHERE tgl_absen = ? AND (LOWER(nip_user) = LOWER(?) OR LOWER(nip_user) = LOWER(?) OR LOWER(nama) = LOWER(?))'
        )
        .get(todayStr, user.nisNip, user.username, user.nama) as Record<string, unknown> | undefined;
      if (existing) {
        res.status(409).json({
          status: false,
          alreadyCheckedIn: true,
          message: `Anda sudah melakukan Presensi GPS pada pukul ${existing.waktu_input} WIB. Jam presensi terkunci agar tidak berubah.`,
        });
        return;
      }
    }

    const userLat = typeof req.body?.userLat === 'number' ? req.body.userLat : null;
    const userLng = typeof req.body?.userLng === 'number' ? req.body.userLng : null;
    const cfg = getPengaturan();
    let infoJarak = 'Daring (GPS Nonaktif)';

    if (kalender.modeKbm.toLowerCase() === 'luring') {
      if (userLat === null || userLng === null) {
        res.status(400).json({ status: false, message: 'KBM Luring mewajibkan deteksi lokasi GPS.' });
        return;
      }
      const jarakRounded = Math.round(hitungJarakMeter(userLat, userLng, cfg.latGps, cfg.lngGps));
      if (jarakRounded > cfg.radiusMeter) {
        res.status(400).json({
          status: false,
          message: `Presensi Luring Gagal! Jarak Anda ${jarakRounded} meter (Maksimal ${cfg.radiusMeter} meter).`,
        });
        return;
      }
      infoJarak = `${jarakRounded} meter (Luring)`;
    } else if (userLat !== null && userLng !== null) {
      const jarakDaring = Math.round(hitungJarakMeter(userLat, userLng, cfg.latGps, cfg.lngGps));
      infoJarak = `Daring (${jarakDaring}m - Bebas Radius)`;
    }

    if (user.role === 'siswa') {
      const siswaAbsenData = {
        tgl_absen: todayStr,
        waktu_input: waktuFormatted,
        nis: user.nisNip,
        nama: user.nama,
        kelas: user.kelas,
        jurusan: user.jurusan || '-',
        jk: user.jk || '-',
        status: 'Hadir',
        jarak_meter: infoJarak,
      };
      db.prepare(
        `INSERT INTO kehadiran_siswa (tgl_absen, waktu_input, nis, nama, kelas, jurusan, jk, status, jarak_meter)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Hadir', ?)`
      ).run(todayStr, waktuFormatted, user.nisNip, user.nama, user.kelas, user.jurusan || '-', user.jk || '-', infoJarak);
      await syncRecordToSupabase('kehadiran_siswa', siswaAbsenData);
      void syncRecordToMysql('kehadiran_siswa', siswaAbsenData);
    } else {
      const nipId = user.nisNip || user.username;
      const pegawaiAbsenData = {
        tgl_absen: todayStr,
        waktu_input: waktuFormatted,
        nip_user: nipId,
        nama: user.nama,
        role_jabatan: user.role.toUpperCase(),
        jk: user.jk || 'L',
        status: 'Hadir',
        jarak_meter: infoJarak,
      };
      db.prepare(
        `INSERT INTO kehadiran_pegawai (tgl_absen, waktu_input, nip_user, nama, role_jabatan, jk, status, jarak_meter)
         VALUES (?, ?, ?, ?, ?, ?, 'Hadir', ?)`
      ).run(todayStr, waktuFormatted, nipId, user.nama, user.role.toUpperCase(), user.jk || 'L', infoJarak);
      await syncRecordToSupabase('kehadiran_pegawai', pegawaiAbsenData);
      void syncRecordToMysql('kehadiran_pegawai', pegawaiAbsenData);
    }

    broadcastUpdate('presensi');
    res.json({
      status: true,
      tglAbsen: todayStr,
      waktuInput: waktuFormatted,
      jarakMeter: infoJarak,
      message: `Presensi (${kalender.modeKbm}) berhasil tercatat pada ${todayStr} pukul ${waktuFormatted} WIB.`,
    });
  });

  // === PEGAWAI MANUAL & UPDATE (ADMIN ONLY) ===
  app.post('/api/pegawai/presensi', requireAuth, requireRole(['admin']), (req, res) => {
    const { tglAbsen, nipUser, nama, roleJabatan, status, jarakMeter } = req.body || {};
    if (!tglAbsen || !nipUser || !nama || !status) {
      res.status(400).json({ status: false, message: 'Data presensi pegawai tidak lengkap.' });
      return;
    }
    const waktuJam = getTimeWIB().substring(0, 5);
    const pegawaiPayload = {
      tgl_absen: tglAbsen,
      waktu_input: waktuJam,
      nip_user: nipUser,
      nama,
      role_jabatan: roleJabatan || 'GURU',
      jk: 'L',
      status,
      jarak_meter: jarakMeter || 'Input Admin',
    };
    db.prepare(
      `INSERT INTO kehadiran_pegawai (tgl_absen, waktu_input, nip_user, nama, role_jabatan, jk, status, jarak_meter)
       VALUES (?, ?, ?, ?, ?, 'L', ?, ?)
       ON CONFLICT(tgl_absen, nip_user) DO UPDATE SET
         waktu_input = excluded.waktu_input,
         status = excluded.status,
         jarak_meter = excluded.jarak_meter`
    ).run(tglAbsen, waktuJam, nipUser, nama, roleJabatan || 'GURU', status, jarakMeter || 'Input Admin');
    void syncRecordToMysql('kehadiran_pegawai', pegawaiPayload);

    broadcastUpdate('pegawai');
    res.json({ status: true, message: `Status presensi ${nama} disimpan (${status}).` });
  });

  app.delete('/api/pegawai/presensi/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM kehadiran_pegawai WHERE id = ?').run(id);
    void deleteRecordFromMysql('kehadiran_pegawai', 'id', id);
    broadcastUpdate('pegawai');
    res.json({ status: true, message: 'Log presensi pegawai berhasil dihapus.' });
  });

  // === ABSENSI SISWA BATCH ===
  app.post('/api/absensi/batch', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const batch = Array.isArray(req.body?.batch) ? req.body.batch : [];
    if (batch.length === 0) {
      res.status(400).json({ status: false, message: 'Daftar siswa kosong.' });
      return;
    }
    const waktuJam = getTimeWIB().substring(0, 5);
    const stmt = db.prepare(
      `INSERT INTO kehadiran_siswa (tgl_absen, waktu_input, nis, nama, kelas, jurusan, jk, status, jarak_meter)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Input Guru Kelas')
       ON CONFLICT(tgl_absen, nis) DO UPDATE SET
         waktu_input = excluded.waktu_input,
         kelas = excluded.kelas,
         status = excluded.status,
         jarak_meter = excluded.jarak_meter`
    );
    const tx = db.transaction((items: Array<Record<string, string>>) => {
      for (const item of items) {
        stmt.run(
          item.tglAbsen || getTodayWIB(),
          waktuJam,
          item.nis,
          item.nama,
          item.kelas,
          item.jurusan || '-',
          item.jk || 'L',
          item.status || 'Hadir'
        );
      }
    });
    tx(batch);
    if (isMysqlConfigured()) {
      for (const item of batch) {
        void syncRecordToMysql('kehadiran_siswa', {
          tgl_absen: item.tglAbsen || getTodayWIB(),
          waktu_input: waktuJam,
          nis: item.nis,
          nama: item.nama,
          kelas: item.kelas,
          jurusan: item.jurusan || '-',
          jk: item.jk || 'L',
          status: item.status || 'Hadir',
          jarak_meter: 'Input Guru Kelas',
        });
      }
    }
    broadcastUpdate('absensi-siswa');
    res.json({ status: true, message: 'Presensi kelas berhasil disimpan!' });
  });

  // === JURNAL HARIAN GURU (+ OPTIONAL BATCH ABSENSI) ===
  app.post('/api/jurnal', requireAuth, requireRole(['admin', 'guru']), async (req: AuthedRequest, res) => {
    const user = req.user!;
    const { tanggal, jamKe, kelas, mapel, tujuan, materi, metode, refleksi, tugas, nilaiProgres, fotoUrl, absensiBatch } =
      req.body || {};
    if (!tanggal || !jamKe || !kelas || !mapel || !materi) {
      res.status(400).json({ status: false, message: 'Tanggal, jam ke, kelas, mapel, dan materi wajib diisi.' });
      return;
    }

    // Guru wajib memiliki jadwal mengajar terdaftar pada hari/kelas/mapel terkait
    if (user.role === 'guru') {
      const hariKbm = getNamaHariWIB(String(tanggal));
      const matchedSchedule = db
        .prepare(
          `SELECT id FROM jadwal_pelajaran
           WHERE LOWER(hari) = LOWER(?) AND kelas = ? AND LOWER(mapel) = LOWER(?) AND LOWER(guru) = LOWER(?)
           LIMIT 1`
        )
        .get(hariKbm, String(kelas).trim(), String(mapel).trim(), user.nama) as { id: number } | undefined;

      if (!matchedSchedule) {
        res.status(400).json({
          status: false,
          message: `Anda wajib membuat jadwal di Master Kelola Jadwal Mengajar Guru untuk hari ${hariKbm} (${kelas} - ${mapel}) sebelum mengisi Jurnal Harian.`,
        });
        return;
      }
    }

    const waktuInput = `${getTodayWIB()} ${getTimeWIB().substring(0, 5)}`;
    const waktuJam = getTimeWIB().substring(0, 5);

    const insertedJurnalId = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO jurnal_harian (
          waktu_input, tanggal, guru_nama, jam_ke, kelas, mapel, tujuan, materi, metode, refleksi, tugas, nilai_progres, foto_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        waktuInput,
        tanggal,
        user.nama,
        jamKe,
        kelas,
        mapel,
        tujuan || '-',
        materi,
        metode || '-',
        refleksi || '-',
        tugas || '-',
        nilaiProgres || '-',
        fotoUrl || '-'
      );

      if (Array.isArray(absensiBatch) && absensiBatch.length > 0) {
        const stmt = db.prepare(
          `INSERT INTO kehadiran_siswa (tgl_absen, waktu_input, nis, nama, kelas, jurusan, jk, status, jarak_meter)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Jurnal KBM Guru')
           ON CONFLICT(tgl_absen, nis) DO UPDATE SET
             waktu_input = excluded.waktu_input,
             kelas = excluded.kelas,
             status = excluded.status,
             jarak_meter = excluded.jarak_meter`
        );
        for (const item of absensiBatch) {
          stmt.run(
            tanggal,
            waktuJam,
            item.nis,
            item.nama,
            item.kelas || kelas,
            item.jurusan || '-',
            item.jk || 'L',
            item.status || 'Hadir'
          );
        }
      }
      return Number(info.lastInsertRowid);
    })();

    const jurnalPayload = {
      id: insertedJurnalId,
      waktu_input: waktuInput,
      tanggal,
      guru_nama: user.nama,
      jam_ke: jamKe,
      kelas,
      mapel,
      tujuan: tujuan || '-',
      materi,
      metode: metode || '-',
      refleksi: refleksi || '-',
      tugas: tugas || '-',
      nilai_progres: nilaiProgres || '-',
      foto_url: fotoUrl || '-',
    };
    await syncRecordToSupabase('jurnal_harian', jurnalPayload);
    void syncRecordToMysql('jurnal_harian', jurnalPayload);
    if (isMysqlConfigured() && Array.isArray(absensiBatch)) {
      for (const item of absensiBatch) {
        void syncRecordToMysql('kehadiran_siswa', {
          tgl_absen: tanggal,
          waktu_input: waktuJam,
          nis: item.nis,
          nama: item.nama,
          kelas: item.kelas || kelas,
          jurusan: item.jurusan || '-',
          jk: item.jk || 'L',
          status: item.status || 'Hadir',
          jarak_meter: 'Jurnal KBM Guru',
        });
      }
    }

    broadcastUpdate('jurnal');
    res.json({ status: true, message: 'Jurnal Harian & Absensi KBM berhasil disimpan!' });
  });

  // === PEMBINAAN SISWA ===
  app.post('/api/pembinaan', requireAuth, requireRole(['admin', 'guru']), (req: AuthedRequest, res) => {
    const user = req.user!;
    const { tanggal, nis, nama, kelas, jenis, poin, uraian, solusi } = req.body || {};
    if (!tanggal || !nis || !nama || !uraian || !solusi) {
      res.status(400).json({ status: false, message: 'Lengkapi seluruh data pembinaan siswa.' });
      return;
    }
    const waktuInput = `${getTodayWIB()} ${getTimeWIB().substring(0, 5)}`;
    const info = db.prepare(
      `INSERT INTO pembinaan_siswa (waktu_input, tanggal, nis, nama, kelas, guru_pembina, jenis, poin, uraian, solusi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(waktuInput, tanggal, nis, nama, kelas, user.nama, jenis || 'Pelanggaran', Number(poin) || 0, uraian, solusi);
    void syncRecordToMysql('pembinaan_siswa', {
      id: Number(info.lastInsertRowid),
      waktu_input: waktuInput,
      tanggal,
      nis,
      nama,
      kelas,
      guru_pembina: user.nama,
      jenis: jenis || 'Pelanggaran',
      poin: Number(poin) || 0,
      uraian,
      solusi,
    });
    broadcastUpdate('pembinaan');
    res.json({ status: true, message: 'Catatan pembinaan berhasil disimpan!' });
  });

  // === CRUD SISWA (KHUSUS ADMIN) ===
  app.post('/api/siswa', requireAuth, requireRole(['admin']), (req, res) => {
    const { nis, nama, kelas, jurusan, jk, tempatPkl, nilaiSm1, nilaiSm2, statusSm1, statusSm2, tugasBelumSm1, tugasBelumSm2 } =
      req.body || {};
    if (!nis || !nama || !kelas || !jurusan) {
      res.status(400).json({ status: false, message: 'NIS, Nama, Kelas, dan Jurusan wajib diisi.' });
      return;
    }
    try {
      const siswaRecord = {
        nis: String(nis).trim(),
        nama: String(nama).trim(),
        kelas: String(kelas).trim(),
        jurusan: String(jurusan).trim(),
        jk: String(jk || 'L').trim(),
        tempat_pkl: String(tempatPkl || '-'),
        nilai_sm1: String(nilaiSm1 || '-'),
        nilai_sm2: String(nilaiSm2 || '-'),
        status_sm1: String(statusSm1 || '-'),
        status_sm2: String(statusSm2 || '-'),
        tugas_belum_sm1: String(tugasBelumSm1 || '-'),
        tugas_belum_sm2: String(tugasBelumSm2 || '-'),
      };
      db.prepare(
        `INSERT INTO siswa (nis, nama, kelas, jurusan, jk, tempat_pkl, nilai_sm1, nilai_sm2, status_sm1, status_sm2, tugas_belum_sm1, tugas_belum_sm2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        siswaRecord.nis,
        siswaRecord.nama,
        siswaRecord.kelas,
        siswaRecord.jurusan,
        siswaRecord.jk,
        siswaRecord.tempat_pkl,
        siswaRecord.nilai_sm1,
        siswaRecord.nilai_sm2,
        siswaRecord.status_sm1,
        siswaRecord.status_sm2,
        siswaRecord.tugas_belum_sm1,
        siswaRecord.tugas_belum_sm2
      );
      void syncRecordToMysql('siswa', siswaRecord);
      broadcastUpdate('siswa');
      res.json({ status: true, message: 'Siswa baru berhasil ditambahkan!' });
    } catch {
      res.status(400).json({ status: false, message: 'NIS sudah terdaftar atau data tidak valid.' });
    }
  });

  app.put('/api/siswa/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const id = Number(req.params.id);
    const { nis, nama, kelas, jurusan, jk, tempatPkl, nilaiSm1, nilaiSm2, statusSm1, statusSm2, tugasBelumSm1, tugasBelumSm2 } =
      req.body || {};
    if (!nis || !nama || !kelas || !jurusan) {
      res.status(400).json({ status: false, message: 'NIS, Nama, Kelas, dan Jurusan wajib diisi.' });
      return;
    }
    const siswaRecord = {
      nis: String(nis).trim(),
      nama: String(nama).trim(),
      kelas: String(kelas).trim(),
      jurusan: String(jurusan).trim(),
      jk: String(jk || 'L').trim(),
      tempat_pkl: String(tempatPkl || '-'),
      nilai_sm1: String(nilaiSm1 || '-'),
      nilai_sm2: String(nilaiSm2 || '-'),
      status_sm1: String(statusSm1 || '-'),
      status_sm2: String(statusSm2 || '-'),
      tugas_belum_sm1: String(tugasBelumSm1 || '-'),
      tugas_belum_sm2: String(tugasBelumSm2 || '-'),
    };
    db.prepare(
      `UPDATE siswa SET
        nis = ?, nama = ?, kelas = ?, jurusan = ?, jk = ?,
        tempat_pkl = ?, nilai_sm1 = ?, nilai_sm2 = ?, status_sm1 = ?, status_sm2 = ?,
        tugas_belum_sm1 = ?, tugas_belum_sm2 = ?
       WHERE id = ?`
    ).run(
      siswaRecord.nis,
      siswaRecord.nama,
      siswaRecord.kelas,
      siswaRecord.jurusan,
      siswaRecord.jk,
      siswaRecord.tempat_pkl,
      siswaRecord.nilai_sm1,
      siswaRecord.nilai_sm2,
      siswaRecord.status_sm1,
      siswaRecord.status_sm2,
      siswaRecord.tugas_belum_sm1,
      siswaRecord.tugas_belum_sm2,
      id
    );
    void syncRecordToMysql('siswa', siswaRecord);
    broadcastUpdate('siswa');
    res.json({ status: true, message: 'Data siswa berhasil diperbarui!' });
  });

  app.delete('/api/siswa/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT nis FROM siswa WHERE id = ?').get(id) as { nis: string } | undefined;
    db.prepare('DELETE FROM siswa WHERE id = ?').run(id);
    if (existing?.nis) {
      void deleteRecordFromMysql('siswa', 'nis', existing.nis);
    }
    broadcastUpdate('siswa');
    res.json({ status: true, message: 'Data siswa berhasil dihapus.' });
  });

  // === JADWAL MENGAJAR (CEK BENTROK KELAS & JAM) ===
  function findJadwalConflict(hariInput: string, jamInput: string, kelasInput: string, guruInput: string): {
    conflict: boolean;
    message: string;
  } {
    const cleanHari = String(hariInput || '').trim();
    const cleanJam = String(jamInput || '').trim();
    const cleanKelas = String(kelasInput || '').trim();
    const cleanGuru = String(guruInput || '').trim();
    const newRange = parseJamKeRangeFromJadwal(cleanJam);

    const dayRows = db
      .prepare('SELECT * FROM jadwal_pelajaran WHERE LOWER(TRIM(hari)) = LOWER(TRIM(?))')
      .all(cleanHari) as Array<Record<string, unknown>>;

    const isTimeOverlap = (exJamStr: string): boolean => {
      const exRange = parseJamKeRangeFromJadwal(exJamStr);
      if (newRange.start !== null && newRange.end !== null && exRange.start !== null && exRange.end !== null) {
        return newRange.start <= exRange.end && newRange.end >= exRange.start;
      }
      return cleanJam.toLowerCase() === exJamStr.trim().toLowerCase();
    };

    for (const row of dayRows) {
      const exKelas = String(row.kelas || '').trim();
      const exJam = String(row.jam || '').trim();
      const exGuru = String(row.guru || '').trim();
      const exMapel = String(row.mapel || '').trim();

      if (exKelas.toLowerCase() === cleanKelas.toLowerCase() && isTimeOverlap(exJam)) {
        return {
          conflict: true,
          message: `Peringatan! Kelas ${cleanKelas} pada hari ${cleanHari} (${exJam}) sudah memiliki jadwal mengajar oleh ${exGuru} (${exMapel}). Jadwal di kelas & jam yang sama tidak bisa disimpan.`,
        };
      }
    }

    for (const row of dayRows) {
      const exKelas = String(row.kelas || '').trim();
      const exJam = String(row.jam || '').trim();
      const exGuru = String(row.guru || '').trim();

      if (exGuru.toLowerCase() === cleanGuru.toLowerCase() && isTimeOverlap(exJam)) {
        return {
          conflict: true,
          message: `Peringatan! Guru ${cleanGuru} sudah memiliki jadwal mengajar di kelas ${exKelas} pada hari ${cleanHari} (${exJam}). Tidak bisa membuat jadwal bentrok pada jam yang sama.`,
        };
      }
    }

    return { conflict: false, message: '' };
  }

  app.get('/api/jadwal/check-conflict', requireAuth, requireRole(['admin', 'guru']), (req: AuthedRequest, res) => {
    const hari = String(req.query.hari || '').trim();
    const jam = String(req.query.jam || '').trim();
    const kelas = String(req.query.kelas || '').trim();
    const guruParam = String(req.query.guru || '').trim();
    if (!hari || !jam || !kelas) {
      res.json({ status: true, conflict: false, message: '' });
      return;
    }
    const guruName = req.user!.role === 'admin' && guruParam ? guruParam : req.user!.nama;
    const result = findJadwalConflict(hari, jam, kelas, guruName);
    res.json({ status: true, conflict: result.conflict, message: result.message });
  });

  app.post('/api/jadwal', requireAuth, requireRole(['admin', 'guru']), (req: AuthedRequest, res) => {
    const user = req.user!;
    const { hari, jam, kelas, mapel, guru, ruang } = req.body || {};
    if (!hari || !jam || !kelas || !mapel) {
      res.status(400).json({ status: false, message: 'Hari, jam, kelas, dan mapel wajib diisi.' });
      return;
    }
    const cleanHari = String(hari).trim();
    const cleanJam = String(jam).trim();
    const cleanKelas = String(kelas).trim();
    const cleanMapel = String(mapel).trim();
    const guruName = user.role === 'admin' && guru ? String(guru).trim() : user.nama;

    const conflictCheck = findJadwalConflict(cleanHari, cleanJam, cleanKelas, guruName);
    if (conflictCheck.conflict) {
      res.status(409).json({ status: false, message: conflictCheck.message });
      return;
    }

    const info = db
      .prepare('INSERT INTO jadwal_pelajaran (hari, jam, kelas, mapel, guru, ruang) VALUES (?, ?, ?, ?, ?, ?)')
      .run(cleanHari, cleanJam, cleanKelas, cleanMapel, guruName, String(ruang || 'Kelas Utama').trim());
    void syncRecordToMysql('jadwal_pelajaran', {
      id: Number(info.lastInsertRowid),
      hari: cleanHari,
      jam: cleanJam,
      kelas: cleanKelas,
      mapel: cleanMapel,
      guru: guruName,
      ruang: String(ruang || 'Kelas Utama').trim(),
    });
    broadcastUpdate('jadwal');
    res.json({ status: true, message: 'Jadwal mengajar berhasil ditambahkan!' });
  });

  app.delete('/api/jadwal/:id', requireAuth, requireRole(['admin', 'guru']), (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (req.user!.role === 'admin') {
      db.prepare('DELETE FROM jadwal_pelajaran WHERE id = ?').run(id);
      void deleteRecordFromMysql('jadwal_pelajaran', 'id', id);
    } else {
      const resDel = db
        .prepare('DELETE FROM jadwal_pelajaran WHERE id = ? AND LOWER(guru) = LOWER(?)')
        .run(id, req.user!.nama);
      if (resDel.changes > 0) {
        void deleteRecordFromMysql('jadwal_pelajaran', 'id', id);
      }
    }
    broadcastUpdate('jadwal');
    res.json({ status: true, message: 'Jadwal berhasil dihapus.' });
  });

  // === KALENDER SEKOLAH ===
  app.post('/api/kalender', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const { tanggal, modeKbm, statusEfektif, jamMulai, jamSelesai, keterangan } = req.body || {};
    if (!tanggal) {
      res.status(400).json({ status: false, message: 'Tanggal wajib diisi.' });
      return;
    }
    const kalPayload = {
      tanggal: String(tanggal).substring(0, 10),
      mode_kbm: modeKbm || 'Luring',
      status_efektif: statusEfektif || 'Efektif',
      jam_mulai: jamMulai || '06:30',
      jam_selesai: jamSelesai || '16:00',
      keterangan: keterangan || '-',
    };
    db.prepare(
      `INSERT INTO kalender_pendidikan (tanggal, mode_kbm, status_efektif, jam_mulai, jam_selesai, keterangan)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tanggal) DO UPDATE SET
         mode_kbm = excluded.mode_kbm,
         status_efektif = excluded.status_efektif,
         jam_mulai = excluded.jam_mulai,
         jam_selesai = excluded.jam_selesai,
         keterangan = excluded.keterangan`
    ).run(
      kalPayload.tanggal,
      kalPayload.mode_kbm,
      kalPayload.status_efektif,
      kalPayload.jam_mulai,
      kalPayload.jam_selesai,
      kalPayload.keterangan
    );
    void syncRecordToMysql('kalender_pendidikan', kalPayload);
    broadcastUpdate('kalender');
    res.json({ status: true, message: `Kalender Sekolah ${tanggal} berhasil disimpan!` });
  });

  app.put('/api/kalender/:id', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const id = Number(req.params.id);
    const { tanggal, modeKbm, statusEfektif, jamMulai, jamSelesai, keterangan } = req.body || {};
    if (!id || !tanggal) {
      res.status(400).json({ status: false, message: 'ID dan Tanggal wajib diisi.' });
      return;
    }
    const existing = db.prepare('SELECT * FROM kalender_pendidikan WHERE id = ?').get(id) as
      | { tanggal: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ status: false, message: 'Entri kalender tidak ditemukan.' });
      return;
    }
    const cleanDate = String(tanggal).substring(0, 10);
    const kalPayload = {
      tanggal: cleanDate,
      mode_kbm: modeKbm || 'Luring',
      status_efektif: statusEfektif || 'Efektif',
      jam_mulai: jamMulai || '-',
      jam_selesai: jamSelesai || '-',
      keterangan: keterangan || '-',
    };

    try {
      db.prepare(
        `UPDATE kalender_pendidikan
         SET tanggal = ?, mode_kbm = ?, status_efektif = ?, jam_mulai = ?, jam_selesai = ?, keterangan = ?
         WHERE id = ?`
      ).run(
        kalPayload.tanggal,
        kalPayload.mode_kbm,
        kalPayload.status_efektif,
        kalPayload.jam_mulai,
        kalPayload.jam_selesai,
        kalPayload.keterangan,
        id
      );
      if (existing.tanggal !== cleanDate) {
        void deleteRecordFromMysql('kalender_pendidikan', 'tanggal', existing.tanggal);
      }
      void syncRecordToMysql('kalender_pendidikan', kalPayload);
      broadcastUpdate('kalender');
      res.json({ status: true, message: `Kalender Sekolah ${cleanDate} berhasil diperbarui!` });
    } catch {
      res.status(409).json({
        status: false,
        message: `Tanggal ${cleanDate} sudah memiliki entri kalender lain.`,
      });
    }
  });

  app.post('/api/kalender/import', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : '';
    const rawEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    const parseDateFlexible = (raw: string): string | null => {
      const s = String(raw || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (dmy) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
      }
      return null;
    };

    type KalEntry = {
      tanggal: string;
      modeKbm: string;
      statusEfektif: string;
      jamMulai: string;
      jamSelesai: string;
      keterangan: string;
    };
    const parsedEntries: KalEntry[] = [];
    let skippedCount = 0;

    if (rawEntries.length > 0) {
      for (const item of rawEntries) {
        const tgl = parseDateFlexible(String(item?.tanggal || ''));
        if (!tgl) {
          skippedCount++;
          continue;
        }
        const modeRaw = String(item?.modeKbm || 'Luring').trim();
        const modeKbm = modeRaw.toLowerCase().includes('libur')
          ? 'Libur'
          : modeRaw.toLowerCase().includes('daring')
            ? 'Daring'
            : 'Luring';
        const statusRaw = String(item?.statusEfektif || '').trim();
        const statusEfektif =
          modeKbm === 'Libur' || statusRaw.toLowerCase().includes('tidak')
            ? 'Tidak Efektif'
            : 'Efektif';
        parsedEntries.push({
          tanggal: tgl,
          modeKbm,
          statusEfektif,
          jamMulai: String(item?.jamMulai || (modeKbm === 'Libur' ? '-' : '06:30')).trim(),
          jamSelesai: String(item?.jamSelesai || (modeKbm === 'Libur' ? '-' : '16:00')).trim(),
          keterangan: String(item?.keterangan || (modeKbm === 'Libur' ? 'Hari Libur' : 'Hari Efektif Sekolah')).trim(),
        });
      }
    } else if (csvContent.trim()) {
      const lines: string[] = csvContent.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      const sep = lines[0]?.includes(';') && !lines[0]?.includes(',') ? ';' : ',';
      const firstCols = (lines[0] || '').split(sep).map((c: string) => c.trim().toLowerCase().replace(/\s+/g, '_'));
      const hasHeader = firstCols.some((c: string) => c.includes('tanggal') || c.includes('tgl') || c.includes('date'));
      const colIdx = {
        tanggal: Math.max(0, firstCols.findIndex((c: string) => c.includes('tanggal') || c.includes('tgl') || c.includes('date'))),
        mode: hasHeader ? firstCols.findIndex((c: string) => c.includes('mode') || c.includes('jenis')) : 1,
        status: hasHeader ? firstCols.findIndex((c: string) => c.includes('status') || c.includes('efektif')) : 2,
        jamMulai: hasHeader ? firstCols.findIndex((c: string) => c.includes('mulai') || c.includes('start')) : 3,
        jamSelesai: hasHeader ? firstCols.findIndex((c: string) => c.includes('selesai') || c.includes('end')) : 4,
        ket: hasHeader ? firstCols.findIndex((c: string) => c.includes('ket') || c.includes('uraian') || c.includes('agenda')) : 5,
      };
      const startRow = hasHeader ? 1 : 0;
      for (let i = startRow; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c: string) => c.trim().replace(/^"|"$/g, ''));
        const tgl = parseDateFlexible(cols[colIdx.tanggal] || '');
        if (!tgl) {
          skippedCount++;
          continue;
        }
        const modeRaw = (colIdx.mode >= 0 ? cols[colIdx.mode] : '') || '';
        const statusRaw = (colIdx.status >= 0 ? cols[colIdx.status] : '') || '';
        const modeLower = modeRaw.toLowerCase();
        const statusLower = statusRaw.toLowerCase();
        const modeKbm = modeLower.includes('libur')
          ? 'Libur'
          : modeLower.includes('daring')
            ? 'Daring'
            : modeLower.includes('luring')
              ? 'Luring'
              : statusLower.includes('tidak')
                ? 'Libur'
                : 'Luring';
        const statusEfektif =
          modeKbm === 'Libur' || statusLower.includes('tidak')
            ? 'Tidak Efektif'
            : 'Efektif';
        parsedEntries.push({
          tanggal: tgl,
          modeKbm,
          statusEfektif,
          jamMulai: (colIdx.jamMulai >= 0 ? cols[colIdx.jamMulai] : '') || (modeKbm === 'Libur' ? '-' : '06:30'),
          jamSelesai: (colIdx.jamSelesai >= 0 ? cols[colIdx.jamSelesai] : '') || (modeKbm === 'Libur' ? '-' : '16:00'),
          keterangan: (colIdx.ket >= 0 ? cols[colIdx.ket] : '') || (modeKbm === 'Libur' ? 'Libur / Tidak Efektif' : 'Hari Efektif Sekolah'),
        });
      }
    }

    if (parsedEntries.length === 0) {
      res.status(400).json({
        status: false,
        message: 'Tidak ada baris tanggal valid yang ditemukan. Gunakan format YYYY-MM-DD atau DD/MM/YYYY.',
      });
      return;
    }

    const stmt = db.prepare(
      `INSERT INTO kalender_pendidikan (tanggal, mode_kbm, status_efektif, jam_mulai, jam_selesai, keterangan)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tanggal) DO UPDATE SET
         mode_kbm = excluded.mode_kbm,
         status_efektif = excluded.status_efektif,
         jam_mulai = excluded.jam_mulai,
         jam_selesai = excluded.jam_selesai,
         keterangan = excluded.keterangan`
    );

    const tx = db.transaction((items: KalEntry[]) => {
      for (const item of items) {
        stmt.run(item.tanggal, item.modeKbm, item.statusEfektif, item.jamMulai, item.jamSelesai, item.keterangan);
      }
    });
    tx(parsedEntries);

    if (isMysqlConfigured()) {
      for (const item of parsedEntries) {
        void syncRecordToMysql('kalender_pendidikan', {
          tanggal: item.tanggal,
          mode_kbm: item.modeKbm,
          status_efektif: item.statusEfektif,
          jam_mulai: item.jamMulai,
          jam_selesai: item.jamSelesai,
          keterangan: item.keterangan,
        });
      }
    }
    broadcastUpdate('kalender');
    res.json({
      status: true,
      importedCount: parsedEntries.length,
      skippedCount,
      message: `${parsedEntries.length} tanggal Kalender Sekolah berhasil diimpor dan diperbarui!`,
    });
  });

  app.delete('/api/kalender/:id', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT tanggal FROM kalender_pendidikan WHERE id = ?').get(id) as { tanggal: string } | undefined;
    db.prepare('DELETE FROM kalender_pendidikan WHERE id = ?').run(id);
    if (row?.tanggal) {
      void deleteRecordFromMysql('kalender_pendidikan', 'tanggal', row.tanggal);
    }
    broadcastUpdate('kalender');
    res.json({ status: true, message: 'Entri Kalender Sekolah dihapus.' });
  });

  // === JURUSAN & KURIKULUM (SMK) ===
  app.post('/api/jurusan', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const { kode, nama, kurikulum, fasilitas } = req.body || {};
    if (!kode || !nama) {
      res.status(400).json({ status: false, message: 'Kode dan Nama Jurusan wajib diisi.' });
      return;
    }
    try {
      const cleanKode = String(kode).trim().toUpperCase();
      const cleanNama = String(nama).trim();
      const cleanKur = String(kurikulum || 'Kurikulum Merdeka').trim();
      const cleanFas = String(fasilitas || '-').trim();
      db.prepare('INSERT INTO data_jurusan (kode, nama, kurikulum, fasilitas) VALUES (?, ?, ?, ?)').run(
        cleanKode,
        cleanNama,
        cleanKur,
        cleanFas
      );
      broadcastUpdate('jurusan');
      res.json({ status: true, message: `Jurusan ${cleanKode} berhasil ditambahkan!` });
    } catch {
      res.status(400).json({ status: false, message: 'Kode jurusan sudah terdaftar.' });
    }
  });

  app.put('/api/jurusan/:id', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const id = Number(req.params.id);
    const { kode, nama, kurikulum, fasilitas } = req.body || {};
    if (!kode || !nama) {
      res.status(400).json({ status: false, message: 'Kode dan Nama Jurusan wajib diisi.' });
      return;
    }
    try {
      const cleanKode = String(kode).trim().toUpperCase();
      const cleanNama = String(nama).trim();
      const cleanKur = String(kurikulum || 'Kurikulum Merdeka').trim();
      const cleanFas = String(fasilitas || '-').trim();
      const info = db
        .prepare('UPDATE data_jurusan SET kode = ?, nama = ?, kurikulum = ?, fasilitas = ? WHERE id = ?')
        .run(cleanKode, cleanNama, cleanKur, cleanFas, id);
      if (info.changes === 0) {
        res.status(404).json({ status: false, message: 'Jurusan tidak ditemukan.' });
        return;
      }
      broadcastUpdate('jurusan');
      res.json({ status: true, message: `Jurusan ${cleanKode} berhasil diperbarui!` });
    } catch {
      res.status(400).json({ status: false, message: 'Kode jurusan bertabrakan dengan data lain.' });
    }
  });

  app.delete('/api/jurusan/:id', requireAuth, requireRole(['admin', 'guru']), (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM data_jurusan WHERE id = ?').run(id);
    broadcastUpdate('jurusan');
    res.json({ status: true, message: 'Data jurusan berhasil dihapus.' });
  });

  // === NILAI AKADEMIK SISWA PER MAPEL (DEFAULT 0 + IMPORT CSV) ===
  app.post('/api/nilai/batch', requireAuth, requireRole(['admin', 'guru']), (req: AuthedRequest, res) => {
    const user = req.user!;
    const batch = Array.isArray(req.body?.batch) ? req.body.batch : [];
    const cfg = getPengaturan();
    if (batch.length === 0) {
      res.status(400).json({ status: false, message: 'Daftar nilai siswa kosong.' });
      return;
    }

    const updatedAt = `${getTodayWIB()} ${getTimeWIB().substring(0, 5)}`;
    const stmt = db.prepare(
      `INSERT INTO nilai_siswa (tahun_ajaran, semester, nis, mapel, nilai, status, catatan, guru_nama, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tahun_ajaran, semester, nis, mapel) DO UPDATE SET
         nilai = excluded.nilai,
         status = excluded.status,
         catatan = excluded.catatan,
         guru_nama = excluded.guru_nama,
         updated_at = excluded.updated_at`
    );

    const tx = db.transaction((items: Array<Record<string, unknown>>) => {
      for (const item of items) {
        const nis = String(item.nis || '').trim();
        const mapel = String(item.mapel || '').trim();
        if (!nis || !mapel) continue;
        const tahunAjaran = String(item.tahunAjaran || cfg.tahunAjaran || '2026/2027').trim();
        const semester = String(item.semester || '1').trim();
        const rawNilai = Number(item.nilai ?? 0);
        const nilai = Number.isNaN(rawNilai) ? 0 : Math.max(0, Math.min(100, rawNilai));
        const status =
          item.status && String(item.status).trim()
            ? String(item.status).trim()
            : nilai >= 75
              ? 'Tuntas'
              : nilai > 0
                ? 'Remedial'
                : 'Belum Tuntas';
        const catatan = String(item.catatan || '').trim();
        stmt.run(tahunAjaran, semester, nis, mapel, nilai, status, catatan, user.nama, updatedAt);
      }
    });
    tx(batch);

    broadcastUpdate('nilai');
    res.json({ status: true, message: `Nilai ${batch.length} siswa berhasil disimpan!` });
  });

  app.post('/api/nilai/import', requireAuth, requireRole(['admin', 'guru']), (req: AuthedRequest, res) => {
    const user = req.user!;
    const csvContent = typeof req.body?.csvContent === 'string' ? req.body.csvContent : '';
    const fallbackMapel = String(req.body?.mapel || '').trim();
    const fallbackSemester = String(req.body?.semester || '1').trim();
    const cfg = getPengaturan();
    const fallbackTa = String(req.body?.tahunAjaran || cfg.tahunAjaran || '2026/2027').trim();

    if (!csvContent.trim()) {
      res.status(400).json({ status: false, message: 'Isi file CSV nilai kosong.' });
      return;
    }

    const lines: string[] = csvContent.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      res.status(400).json({ status: false, message: 'File CSV tidak memiliki baris data.' });
      return;
    }

    const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
    const headerCols = lines[0].split(sep).map((c: string) => c.trim().toLowerCase().replace(/\s+/g, '_'));
    const hasHeader = headerCols.some((c: string) => c === 'nis' || c.includes('nis') || c.includes('nama'));

    const idxNis = hasHeader ? headerCols.findIndex((c: string) => c === 'nis' || c.includes('nis')) : 0;
    const idxMapel = hasHeader ? headerCols.findIndex((c: string) => c.includes('mapel') || c.includes('pelajaran')) : -1;
    const idxSemester = hasHeader ? headerCols.findIndex((c: string) => c.includes('semester') || c === 'sm') : -1;
    const idxNilai = hasHeader
      ? headerCols.findIndex((c: string) => c === 'nilai' || c.includes('nilai') || c.includes('score') || c.includes('angka'))
      : 4;
    const idxCatatan = hasHeader ? headerCols.findIndex((c: string) => c.includes('catatan') || c.includes('ket')) : -1;

    const validNisSet = new Set(
      (db.prepare('SELECT nis FROM siswa').all() as Array<{ nis: string }>).map((r) => r.nis.trim().toLowerCase())
    );
    const updatedAt = `${getTodayWIB()} ${getTimeWIB().substring(0, 5)}`;

    const stmt = db.prepare(
      `INSERT INTO nilai_siswa (tahun_ajaran, semester, nis, mapel, nilai, status, catatan, guru_nama, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tahun_ajaran, semester, nis, mapel) DO UPDATE SET
         nilai = excluded.nilai,
         status = excluded.status,
         catatan = excluded.catatan,
         guru_nama = excluded.guru_nama,
         updated_at = excluded.updated_at`
    );

    let importedCount = 0;
    let skippedCount = 0;
    const startIdx = hasHeader ? 1 : 0;

    const tx = db.transaction(() => {
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c: string) => c.trim().replace(/^"|"$/g, ''));
        const nis = idxNis >= 0 ? (cols[idxNis] || '').trim() : '';
        if (!nis || nis.toUpperCase() === 'NIS' || !validNisSet.has(nis.toLowerCase())) {
          if (nis && nis.toUpperCase() !== 'NIS') skippedCount++;
          continue;
        }
        const mapel = (idxMapel >= 0 ? cols[idxMapel] : '') || fallbackMapel;
        if (!mapel) {
          skippedCount++;
          continue;
        }
        const semester = (idxSemester >= 0 ? cols[idxSemester] : '') || fallbackSemester;
        const rawNilaiStr = idxNilai >= 0 ? cols[idxNilai] : '';
        const parsedNum = rawNilaiStr !== undefined && rawNilaiStr !== '' ? Number(rawNilaiStr) : 0;
        const nilai = Number.isNaN(parsedNum) ? 0 : Math.max(0, Math.min(100, parsedNum));
        const status = nilai >= 75 ? 'Tuntas' : nilai > 0 ? 'Remedial' : 'Belum Tuntas';
        const catatan = (idxCatatan >= 0 ? cols[idxCatatan] : '') || '';
        stmt.run(fallbackTa, semester, nis, mapel, nilai, status, catatan, user.nama, updatedAt);
        importedCount++;
      }
    });
    tx();

    if (importedCount === 0) {
      res.status(400).json({
        status: false,
        message: 'Tidak ada data nilai yang cocok dengan NIS siswa dan Mata Pelajaran. Pastikan Mapel dipilih dan NIS sesuai data siswa.',
      });
      return;
    }

    broadcastUpdate('nilai');
    res.json({
      status: true,
      importedCount,
      skippedCount,
      message: `${importedCount} data nilai siswa berhasil diimpor${skippedCount > 0 ? ` (${skippedCount} baris dilewati)` : ''}!`,
    });
  });

  // === USERS & HAK AKSES & PENGATURAN (ADMIN ONLY) ===
  app.post('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
    const { username, password, role, nama, nisNip, kelas, jk } = req.body || {};
    if (!username || !password || !role || !nama || !nisNip) {
      res.status(400).json({ status: false, message: 'Semua field pengguna wajib diisi.' });
      return;
    }
    try {
      const uname = String(username).trim().toLowerCase();
      const passHash = hashPassword(String(password));
      const roleVal = String(role).toLowerCase();
      const namaVal = String(nama).trim();
      const nisVal = String(nisNip).trim();
      const kelasVal = String(kelas || 'ALL');
      const jkVal = String(jk || 'L');
      const info = db
        .prepare('INSERT INTO users (username, password_hash, role, nama, nis_nip, kelas, jk) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uname, passHash, roleVal, namaVal, nisVal, kelasVal, jkVal);
      void syncRecordToMysql('users', {
        id: Number(info.lastInsertRowid),
        username: uname,
        password_hash: passHash,
        role: roleVal,
        nama: namaVal,
        nis_nip: nisVal,
        kelas: kelasVal,
        jk: jkVal,
      });
      broadcastUpdate('users');
      res.json({ status: true, message: 'Pengguna baru berhasil ditambahkan!' });
    } catch {
      res.status(400).json({ status: false, message: 'Username sudah terdaftar.' });
    }
  });

  app.put('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const id = Number(req.params.id);
    const { username, password, role, nama, nisNip, kelas, jk } = req.body || {};
    if (!username || !role || !nama || !nisNip) {
      res.status(400).json({ status: false, message: 'Data pengguna tidak lengkap.' });
      return;
    }
    const uname = String(username).trim().toLowerCase();
    const roleVal = String(role).toLowerCase();
    const namaVal = String(nama).trim();
    const nisVal = String(nisNip).trim();
    const kelasVal = String(kelas || 'ALL');
    const jkVal = String(jk || 'L');
    if (password && String(password).trim().length > 0) {
      db.prepare(
        'UPDATE users SET username = ?, password_hash = ?, role = ?, nama = ?, nis_nip = ?, kelas = ?, jk = ? WHERE id = ?'
      ).run(uname, hashPassword(String(password)), roleVal, namaVal, nisVal, kelasVal, jkVal, id);
    } else {
      db.prepare('UPDATE users SET username = ?, role = ?, nama = ?, nis_nip = ?, kelas = ?, jk = ? WHERE id = ?').run(
        uname,
        roleVal,
        namaVal,
        nisVal,
        kelasVal,
        jkVal,
        id
      );
    }
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (updatedUser) {
      void syncRecordToMysql('users', updatedUser);
    }
    broadcastUpdate('users');
    res.json({ status: true, message: 'Data pengguna berhasil diperbarui!' });
  });

  app.delete('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
    const id = Number(req.params.id);
    const target = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as { username: string } | undefined;
    if (target?.username === 'admin') {
      res.status(400).json({ status: false, message: 'Akun admin utama tidak boleh dihapus.' });
      return;
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    void deleteRecordFromMysql('users', 'id', id);
    broadcastUpdate('users');
    res.json({ status: true, message: 'Pengguna berhasil dihapus.' });
  });

  app.put('/api/hak-akses', requireAuth, requireRole(['admin']), (req, res) => {
    const config = Array.isArray(req.body?.config) ? req.body.config : [];
    const stmt = db.prepare(
      'UPDATE hak_akses_role SET admin = 1, guru = ?, karyawan = ?, siswa = ? WHERE id = ?'
    );
    const tx = db.transaction((items: Array<{ id: string; guru: boolean; karyawan: boolean; siswa: boolean }>) => {
      for (const item of items) {
        stmt.run(item.guru ? 1 : 0, item.karyawan ? 1 : 0, item.siswa ? 1 : 0, item.id);
      }
    });
    tx(config);
    if (isMysqlConfigured()) {
      const rows = db.prepare('SELECT * FROM hak_akses_role').all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        void syncRecordToMysql('hak_akses_role', row);
      }
    }
    broadcastUpdate('hak-akses');
    res.json({ status: true, message: 'Pengaturan Hak Akses berhasil disimpan!' });
  });

  app.put('/api/pengaturan', requireAuth, requireRole(['admin']), (req, res) => {
    const {
      namaSekolah,
      alamatSekolah,
      tahunAjaran,
      jenjangSekolah,
      namaWalikelas,
      kelasAmpu,
      latGps,
      lngGps,
      radiusMeter,
      footerApp,
      logoSekolah,
    } = req.body || {};

    if (!namaSekolah || !alamatSekolah) {
      res.status(400).json({ status: false, message: 'Nama Sekolah dan Alamat Sekolah wajib diisi.' });
      return;
    }

    const cleanNamaSekolah = String(namaSekolah).trim();
    const cleanJenjang = normalizeJenjang(jenjangSekolah, cleanNamaSekolah);
    const cleanTahunAjaran = String(tahunAjaran || '2026/2027').trim();

    db.prepare(
      `UPDATE pengaturan SET
        nama_sekolah = ?, alamat_sekolah = ?, tahun_ajaran = ?, jenjang_sekolah = ?, nama_walikelas = ?, kelas_ampu = ?,
        lat_gps = ?, lng_gps = ?, radius_meter = ?, footer_app = ?, logo_sekolah = ?
       WHERE id = 1`
    ).run(
      cleanNamaSekolah,
      String(alamatSekolah).trim(),
      cleanTahunAjaran,
      cleanJenjang,
      String(namaWalikelas || '-').trim(),
      String(kelasAmpu || '-').trim(),
      Number(latGps) || -7.001759,
      Number(lngGps) || 107.623047,
      Number(radiusMeter) || 100,
      String(footerApp || '').trim(),
      String(logoSekolah || '').trim()
    );
    void syncRecordToMysql('pengaturan', {
      id: 1,
      nama_sekolah: cleanNamaSekolah,
      alamat_sekolah: String(alamatSekolah).trim(),
      tahun_ajaran: cleanTahunAjaran,
      nama_walikelas: String(namaWalikelas || '-').trim(),
      kelas_ampu: String(kelasAmpu || '-').trim(),
      lat_gps: Number(latGps) || -7.001759,
      lng_gps: Number(lngGps) || 107.623047,
      radius_meter: Number(radiusMeter) || 100,
      footer_app: String(footerApp || '').trim(),
      logo_sekolah: String(logoSekolah || '').trim(),
    });
    broadcastUpdate('pengaturan');
    res.json({ status: true, message: 'Pengaturan Sekolah (Jenjang, Tahun Ajaran, Logo, Alamat, GPS) berhasil diperbarui!' });
  });

  app.get('/api/supabase-schema', requireAuth, requireRole(['admin']), (_req, res) => {
    res.json({ status: true, schema: SUPABASE_SQL_SCHEMA, configured: isSupabaseConfigured() });
  });

  // === MYSQL DATABASE INTEGRATION, SQL DUMP & CSV STUDENT IMPORT (ADMIN ONLY) ===
  app.get('/api/admin/mysql-info', requireAuth, requireRole(['admin']), (_req, res) => {
    res.json({
      status: true,
      mysqlConfigured: isMysqlConfigured(),
      schemaSql: MYSQL_SCHEMA_SQL,
      phpTemplate: PHP_CONNECTION_TEMPLATE,
    });
  });

  app.get('/api/admin/mysql-test', requireAuth, requireRole(['admin']), async (_req, res) => {
    const diag = await testMysqlConnection();
    res.json({ status: diag.ok, ...diag });
  });

  app.get('/api/admin/db-debug', requireAuth, requireRole(['admin']), async (_req, res) => {
    const countTable = (table: string): number => {
      const row = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get() as { cnt: number } | undefined;
      return Number(row?.cnt || 0);
    };

    const sqliteCounts = {
      siswa: countTable('siswa'),
      users: countTable('users'),
      jadwal_pelajaran: countTable('jadwal_pelajaran'),
      jurnal_harian: countTable('jurnal_harian'),
      kehadiran_siswa: countTable('kehadiran_siswa'),
      kehadiran_pegawai: countTable('kehadiran_pegawai'),
      pengumpulan_tugas: countTable('pengumpulan_tugas'),
      pembinaan_siswa: countTable('pembinaan_siswa'),
      kalender_pendidikan: countTable('kalender_pendidikan'),
      agenda_akademik: countTable('agenda_akademik'),
      data_jurusan: countTable('data_jurusan'),
      master_mapel: countTable('master_mapel'),
    };

    const mysqlDiag = await testMysqlConnection();
    const envFileExists = fs.existsSync(path.resolve(process.cwd(), '.env'));

    res.json({
      status: true,
      checkedAt: `${getTodayWIB()} ${getTimeWIB()} WIB`,
      envFileExists,
      sqlite: {
        ok: true,
        file: 'data/school.db',
        counts: sqliteCounts,
      },
      mysql: mysqlDiag,
      supabase: {
        configured: isSupabaseConfigured(),
      },
    });
  });

  app.post('/api/admin/mysql-sync', requireAuth, requireRole(['admin']), async (_req, res) => {
    const result = await syncAllFromSqliteToMysql(db);
    if (!result.ok) {
      res.status(400).json({ status: false, message: result.message, syncedCounts: result.syncedCounts });
      return;
    }
    res.json({ status: true, message: result.message, syncedCounts: result.syncedCounts });
  });

  app.get('/api/admin/mysql-export.sql', requireAuth, requireRole(['admin']), (_req, res) => {
    const sqlDump = generateMysqlDumpSql(db);
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="db_absensi_export.sql"');
    res.send(sqlDump);
  });

  app.get('/api/admin/php-api-download', requireAuth, requireRole(['admin']), (_req, res) => {
    const phpPath = path.resolve(process.cwd(), 'public/api.php');
    if (!fs.existsSync(phpPath)) {
      res.status(404).json({ status: false, message: 'File public/api.php tidak ditemukan.' });
      return;
    }
    res.download(phpPath, 'api.php');
  });

  app.post('/api/admin/import-siswa-csv', requireAuth, requireRole(['admin']), async (req, res) => {
    let csvText = typeof req.body?.csvContent === 'string' ? req.body.csvContent : '';
    if (!csvText.trim()) {
      const defaultCsvPath = path.resolve(process.cwd(), 'public/assets/aistudio/ABSEN_SEKOLAH26_3cdeb6ff.csv');
      if (!fs.existsSync(defaultCsvPath)) {
        res.status(404).json({ status: false, message: 'File CSV default tidak ditemukan.' });
        return;
      }
      csvText = fs.readFileSync(defaultCsvPath, 'utf8');
    }

    const { importedCount, skippedCount } = importStudentsFromCsvContent(csvText);
    if (isMysqlConfigured()) {
      void syncAllFromSqliteToMysql(db);
    }
    broadcastUpdate('siswa');
    res.json({
      status: true,
      importedCount,
      skippedCount,
      message: `${importedCount} data siswa berhasil diimpor dan diperbarui!`,
    });
  });

  // === TUGAS DIGITAL SISWA (UPLOAD, STATUS, PENILAIAN ADMIN ONLY) ===
  app.post('/api/tugas/submit', requireAuth, requireRole(['siswa']), (req: AuthedRequest, res) => {
    const user = req.user!;
    const { mapel, tanggalTugas, keterangan, fileName, mimeType, fileBase64 } = req.body || {};

    const ext = ALLOWED_MIME_TYPES[String(mimeType || '').toLowerCase()];
    if (!ext) {
      res.status(400).json({ status: false, message: 'Format file tidak diizinkan (PDF, DOC, DOCX, JPG, PNG, WEBP).' });
      return;
    }
    if (!mapel || !tanggalTugas || !keterangan || !fileBase64) {
      res.status(400).json({ status: false, message: 'Lengkapi data tugas dan berkas dokumen.' });
      return;
    }

    const buf = Buffer.from(String(fileBase64), 'base64');
    if (buf.length === 0 || buf.length > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({ status: false, message: 'Ukuran file maksimal 10 MB.' });
      return;
    }
    if (!validateMagicBytes(buf, String(mimeType).toLowerCase())) {
      res.status(400).json({ status: false, message: 'Isi berkas tidak sesuai dengan format dokumen.' });
      return;
    }

    const tglCompact = getTodayWIB().replace(/-/g, '');
    const cleanOrig = sanitizeFileName(String(fileName || 'tugas'));
    const cleanMapel = sanitizeFileName(String(mapel)).substring(0, 20);
    const randomCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const idPengumpulan = `TGS-${tglCompact}-${randomCode}`;
    const finalFileName = `TGS_${user.nisNip}_${cleanMapel}_${tglCompact}_${randomCode}_${cleanOrig}.${ext}`;
    const resolvedPath = path.resolve(UPLOAD_DIR, finalFileName);
    if (!resolvedPath.startsWith(UPLOAD_DIR + path.sep)) {
      res.status(400).json({ status: false, message: 'Nama file tidak valid.' });
      return;
    }

    fs.writeFileSync(resolvedPath, buf);
    const waktuKirim = `${getTodayWIB()} ${getTimeWIB()}`;

    db.prepare(
      `INSERT INTO pengumpulan_tugas (
        id_pengumpulan, waktu_pengiriman, nis, nama_siswa, kelas, tanggal_tugas, mapel, keterangan, nama_file, file_path, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Terkirim')`
    ).run(
      idPengumpulan,
      waktuKirim,
      user.nisNip,
      user.nama,
      user.kelas,
      String(tanggalTugas).substring(0, 10),
      String(mapel),
      String(keterangan).substring(0, 500),
      finalFileName,
      finalFileName
    );
    void syncRecordToMysql('pengumpulan_tugas', {
      id_pengumpulan: idPengumpulan,
      waktu_pengiriman: waktuKirim,
      nis: user.nisNip,
      nama_siswa: user.nama,
      kelas: user.kelas,
      tanggal_tugas: String(tanggalTugas).substring(0, 10),
      mapel: String(mapel),
      keterangan: String(keterangan).substring(0, 500),
      nama_file: finalFileName,
      file_path: finalFileName,
      status: 'Terkirim',
      nilai_tugas: '',
      catatan_nilai: '',
    });

    broadcastUpdate('tugas');
    res.json({
      status: true,
      receipt: {
        idPengumpulan,
        waktuPengiriman: waktuKirim,
        nis: user.nisNip,
        namaSiswa: user.nama,
        kelas: user.kelas,
        tanggalTugas,
        mapel,
        keterangan,
        namaFile: finalFileName,
        status: 'Terkirim',
        nilaiTugas: '',
        catatanNilai: '',
      },
    });
  });

  app.get('/api/tugas/cek', requireAuth, (req: AuthedRequest, res) => {
    const nis = String(req.query.nis || '').trim();
    const id = String(req.query.id || '').trim().toUpperCase();
    if (!nis || !id) {
      res.status(400).json({ status: false, message: 'Masukkan NIS dan ID Pengumpulan.' });
      return;
    }
    if (req.user!.role === 'siswa' && nis.toLowerCase() !== req.user!.nisNip.toLowerCase()) {
      res.status(403).json({ status: false, message: 'Anda hanya dapat memeriksa tugas milik Anda sendiri.' });
      return;
    }
    const row = db
      .prepare('SELECT * FROM pengumpulan_tugas WHERE UPPER(id_pengumpulan) = ? AND LOWER(nis) = LOWER(?)')
      .get(id, nis) as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ status: false, message: 'Data pengumpulan tugas tidak ditemukan.' });
      return;
    }
    res.json({
      status: true,
      receipt: {
        idPengumpulan: String(row.id_pengumpulan),
        waktuPengiriman: String(row.waktu_pengiriman),
        nis: String(row.nis),
        namaSiswa: String(row.nama_siswa),
        kelas: String(row.kelas),
        tanggalTugas: String(row.tanggal_tugas),
        mapel: String(row.mapel),
        keterangan: String(row.keterangan),
        namaFile: String(row.nama_file),
        status: String(row.status),
        nilaiTugas: String(row.nilai_tugas || ''),
        catatanNilai: String(row.catatan_nilai || ''),
      },
    });
  });

  // Tab Cek & Nilai Tugas Khusus Admin yang bisa update (Hanya ADMIN)
  app.put('/api/tugas/:id/nilai', requireAuth, requireRole(['admin']), (req, res) => {
    const idPengumpulan = String(req.params.id || '').trim().toUpperCase();
    const nilaiTugas = String(req.body?.nilaiTugas ?? '').trim();
    const catatanNilai = String(req.body?.catatanNilai ?? '').trim();
    const numNilai = Number(nilaiTugas);
    if (!nilaiTugas || Number.isNaN(numNilai) || numNilai < 0 || numNilai > 100) {
      res.status(400).json({ status: false, message: 'Nilai tugas harus berupa angka 0 - 100.' });
      return;
    }

    const result = db
      .prepare("UPDATE pengumpulan_tugas SET nilai_tugas = ?, catatan_nilai = ?, status = 'Dinilai' WHERE id_pengumpulan = ?")
      .run(String(numNilai), catatanNilai, idPengumpulan);
    if (result.changes === 0) {
      res.status(404).json({ status: false, message: 'ID Pengumpulan tidak ditemukan.' });
      return;
    }
    const updatedRow = db.prepare('SELECT * FROM pengumpulan_tugas WHERE id_pengumpulan = ?').get(idPengumpulan) as
      | Record<string, unknown>
      | undefined;
    if (updatedRow) {
      void syncRecordToMysql('pengumpulan_tugas', updatedRow);
    }
    broadcastUpdate('tugas');
    res.json({ status: true, message: `Nilai tugas ${idPengumpulan} berhasil disimpan (${numNilai}).` });
  });

  app.get('/api/tugas/:id/download', requireAuth, (req: AuthedRequest, res) => {
    const idPengumpulan = String(req.params.id || '').trim().toUpperCase();
    const row = db.prepare('SELECT * FROM pengumpulan_tugas WHERE id_pengumpulan = ?').get(idPengumpulan) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ status: false, message: 'Berkas tidak ditemukan.' });
      return;
    }
    if (req.user!.role !== 'admin' && String(row.nis).toLowerCase() !== req.user!.nisNip.toLowerCase()) {
      res.status(403).json({ status: false, message: 'Akses berkas ditolak.' });
      return;
    }
    const safeFile = path.basename(String(row.file_path));
    const resolved = path.resolve(UPLOAD_DIR, safeFile);
    if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ status: false, message: 'File fisik tidak ditemukan.' });
      return;
    }
    res.download(resolved, String(row.nama_file));
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ status: false, message: 'Endpoint API tidak ditemukan.' });
  });

  // === VITE / STATIC SERVING ===
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (process.env.npm_lifecycle_event !== 'dev' && fs.existsSync(path.join(distDir, 'index.html')));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const onListening = () => {
    console.log(
      typeof PORT === 'number'
        ? `Server Sistem Integrasi Sekolah berjalan pada http://0.0.0.0:${PORT}`
        : `Server Sistem Integrasi Sekolah berjalan pada socket ${PORT}`
    );
    if (isMysqlConfigured()) {
      void syncAllFromSqliteToMysql(db).then((r) => {
        console.log('[mysql]', r.message);
      });
    }
  };

  if (typeof PORT === 'number') {
    server.listen(PORT, '0.0.0.0', onListening);
  } else {
    server.listen(PORT, onListening);
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
