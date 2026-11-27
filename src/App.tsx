import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  Calendar,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HeartHandshake,
  Layers,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Radio,
  RefreshCw,
  Settings,
  Shield,
  Sun,
  UploadCloud,
  UserCheck,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import type {
  AuthUser,
  BootstrapPayload,
  JadwalRecord,
  KalenderRecord,
  PengaturanSekolah,
} from './shared/types';
import { formatHariTanggal, getTimeWIB, getTodayWIB } from './shared/scheduleConstants';
import { apiRequest, getWebSocketUrl, registerUnauthorizedHandler, setAuthToken } from './utils/api';
import { LoginView } from './components/LoginView';
import { DashboardHome } from './components/DashboardHome';
import { LiveTeacherDashboard } from './components/LiveTeacherDashboard';
import { GpsAttendanceView } from './components/GpsAttendanceView';
import { JurnalGuruView } from './components/JurnalGuruView';
import { PembinaanView } from './components/PembinaanView';
import { RekapSiswaView } from './components/RekapSiswaView';
import { DataSiswaView } from './components/DataSiswaView';
import { RekapAkademikView } from './components/RekapAkademikView';
import { TugasDigitalView } from './components/TugasDigitalView';
import {
  AbsensiKelasView,
  DataKehadiranPegawaiView,
  DataPenggunaView,
  HakAksesView,
  JurusanView,
  KalenderPendidikanView,
  KelolaJadwalGuruView,
  MasterJadwalView,
  MonitoringJurnalView,
  PengaturanSekolahView,
  ProfileView,
} from './components/AdminModulesView';

interface PublicMetaResponse {
  adminClaimed: boolean;
  supabaseConfigured: boolean;
  pengaturan: PengaturanSekolah;
  kalenderHariIni: KalenderRecord;
}

interface NavItemConfig {
  id: string;
  label: string;
  group: 'Utama' | 'Akademik & KBM' | 'Kesiswaan & Data' | 'Administrasi';
  icon: React.FC<{ className?: string }>;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard Utama', group: 'Utama', icon: LayoutDashboard },
  { id: 'dash-kehadiran-guru', label: 'Kehadiran Guru & Rombel', group: 'Utama', icon: Radio },
  { id: 'scan', label: 'Presensi GPS / Daring', group: 'Utama', icon: MapPin },
  { id: 'rekap-pegawai', label: 'Kehadiran Pegawai', group: 'Utama', icon: UserCheck },
  { id: 'kalender-pendidikan', label: 'Kalender Sekolah', group: 'Utama', icon: Calendar },

  { id: 'jurnal', label: 'Jurnal Harian Guru', group: 'Akademik & KBM', icon: BookOpen },
  { id: 'input', label: 'Absensi Kelas', group: 'Akademik & KBM', icon: ClipboardCheck },
  { id: 'guru-jadwal', label: 'Kelola Jadwal Mengajar', group: 'Akademik & KBM', icon: CalendarClock },
  { id: 'master-jadwal', label: 'Master Jadwal Kelas', group: 'Akademik & KBM', icon: Layers },
  { id: 'monitoring', label: 'Jurnal Saya', group: 'Akademik & KBM', icon: FileText },
  { id: 'tugas-digital', label: 'Tugas Digital Siswa', group: 'Akademik & KBM', icon: UploadCloud },

  { id: 'pembinaan', label: 'BK & Pembinaan Siswa', group: 'Kesiswaan & Data', icon: HeartHandshake },
  { id: 'rekap-siswa', label: 'Rekap Presensi Siswa', group: 'Kesiswaan & Data', icon: FileSpreadsheet },
  { id: 'rekap-akademik-admin', label: 'Rekap Nilai & Akademik', group: 'Kesiswaan & Data', icon: Award },
  { id: 'master-siswa', label: 'Data Siswa Sekolah', group: 'Kesiswaan & Data', icon: Users },
  { id: 'master-jurusan', label: 'Jurusan & Kurikulum', group: 'Kesiswaan & Data', icon: GraduationCap },

  { id: 'master-users', label: 'Data Pengguna', group: 'Administrasi', icon: Users },
  { id: 'master-hak-akses', label: 'Hak Akses Peran', group: 'Administrasi', icon: Shield },
  { id: 'pengaturan-sekolah', label: 'Pengaturan Sekolah', group: 'Administrasi', icon: Settings },
  { id: 'profile', label: 'Profil Akun', group: 'Administrasi', icon: UserCircle },
];

const DEFAULT_PENGATURAN: PengaturanSekolah = {
  namaSekolah: 'SMK KP BALEENDAH',
  alamatSekolah: 'Jl. Adipati Agung No. 32 Baleendah - Kab. Bandung',
  tahunAjaran: '2026/2027',
  jenjangSekolah: 'SMK',
  namaWalikelas: 'Wali Kelas',
  kelasAmpu: 'X TJKT 1',
  latGps: -7.001759,
  lngGps: 107.623047,
  radiusMeter: 100,
  footerApp: '© 2026 SISTEM INTEGRASI SEKOLAH',
  logoSekolah: '',
};

const SESSION_STORAGE_KEY = 'sis_auth_session';

function readStoredSession(): { token: string; user: AuthUser } | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; user?: AuthUser };
    if (parsed?.token && parsed?.user?.username) {
      setAuthToken(parsed.token);
      return { token: parsed.token, user: parsed.user };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeStoredSession(session: { token: string; user: AuthUser } | null): void {
  try {
    if (session) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sis_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [adminClaimed, setAdminClaimed] = useState(true);
  const [publicPengaturan, setPublicPengaturan] = useState<PengaturanSekolah>(DEFAULT_PENGATURAN);

  const [user, setUser] = useState<AuthUser | null>(() => readStoredSession()?.user || null);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prefillJadwal, setPrefillJadwal] = useState<JadwalRecord | null>(null);

  const [liveTick, setLiveTick] = useState(0);
  const [todayStr, setTodayStr] = useState(() => getTodayWIB());
  const [clockText, setClockText] = useState(getTimeWIB());
  const [todayText, setTodayText] = useState(formatHariTanggal(getTodayWIB()));
  const [globalError, setGlobalError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; time: string } | null>(null);
  const prevKehadiranLenRef = useRef<number>(0);
  const prevPegawaiLenRef = useRef<number>(0);

  useEffect(() => {
    if (!bootstrap) return;
    const sLen = bootstrap.kehadiran?.length || 0;
    if (prevKehadiranLenRef.current > 0 && sLen > prevKehadiranLenRef.current) {
      const latest = bootstrap.kehadiran[0];
      if (latest) {
        setToastMessage({
          title: 'Presensi GPS Siswa Masuk',
          desc: `${latest.nama} (${latest.kelas}) · ${latest.status}`,
          time: latest.waktuInput || getTimeWIB(),
        });
        const timer = setTimeout(() => setToastMessage(null), 5000);
        return () => clearTimeout(timer);
      }
    }
    prevKehadiranLenRef.current = sLen;
  }, [bootstrap?.kehadiran]);

  useEffect(() => {
    if (!bootstrap) return;
    const pLen = bootstrap.kehadiranPegawai?.length || 0;
    if (prevPegawaiLenRef.current > 0 && pLen > prevPegawaiLenRef.current) {
      const latest = bootstrap.kehadiranPegawai[0];
      if (latest) {
        setToastMessage({
          title: 'Presensi GPS Guru / Pegawai Masuk',
          desc: `${latest.nama} (${latest.roleJabatan}) · ${latest.status}`,
          time: latest.waktuInput || getTimeWIB(),
        });
        const timer = setTimeout(() => setToastMessage(null), 5000);
        return () => clearTimeout(timer);
      }
    }
    prevPegawaiLenRef.current = pLen;
  }, [bootstrap?.kehadiranPegawai]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('sis_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextToday = getTodayWIB();
      setClockText(getTimeWIB());
      setTodayText(formatHariTanggal(nextToday));
      setTodayStr((prev) => (prev !== nextToday ? nextToday : prev));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadPublicMeta = useCallback(async () => {
    setMetaError(null);
    try {
      const data = await apiRequest<PublicMetaResponse>('/api/public/meta');
      setAdminClaimed(data.adminClaimed);
      if (data.pengaturan) {
        setPublicPengaturan(data.pengaturan);
      }
    } catch (err) {
      setMetaError(
        err instanceof Error
          ? err.message
          : 'Tidak dapat terhubung ke server backend API.'
      );
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPublicMeta();
  }, [loadPublicMeta]);

  const refreshBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setGlobalError(null);
    try {
      const data = await apiRequest<BootstrapPayload>('/api/bootstrap');
      setBootstrap(data);
      if (data.pengaturan) {
        setPublicPengaturan(data.pengaturan);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data sekolah.';
      if (msg.toLowerCase().includes('sesi') || msg.toLowerCase().includes('401')) {
        writeStoredSession(null);
        setAuthToken(null);
        setUser(null);
        setBootstrap(null);
        setAuthNotice('Sesi login Anda berakhir atau tidak diterima server. Silakan masuk ulang.');
      } else {
        setGlobalError(msg);
      }
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      writeStoredSession(null);
      setAuthToken(null);
      setUser(null);
      setBootstrap(null);
      setPrefillJadwal(null);
      setGlobalError(null);
      setAuthNotice('Sesi login Anda berakhir. Silakan masuk kembali.');
      setActiveTab('dashboard');
    });
    return () => registerUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshBootstrap();
  }, [user, todayStr, refreshBootstrap]);

  // Real-time WebSocket subscription
  useEffect(() => {
    if (!user) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;
    let failedAttempts = 0;

    const connectWs = () => {
      if (cancelled) return;
      const wsUrl = getWebSocketUrl();
      if (!wsUrl) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        failedAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}')) as { type?: string };
          if (payload.type === 'DATA_UPDATED') {
            setLiveTick((prev) => prev + 1);
            refreshBootstrap();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!cancelled && failedAttempts < 3) {
          failedAttempts += 1;
          reconnectTimer = window.setTimeout(connectWs, 5000 * failedAttempts);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, refreshBootstrap]);

  const handleLoginSuccess = (token: string, authUser: AuthUser) => {
    setAuthToken(token);
    writeStoredSession({ token, user: authUser });
    setAuthNotice(null);
    setMetaError(null);
    setUser(authUser);
    setActiveTab('dashboard');
    setAdminClaimed(true);
  };

  const handleLogout = () => {
    writeStoredSession(null);
    setAuthToken(null);
    setUser(null);
    setBootstrap(null);
    setPrefillJadwal(null);
    setAuthNotice(null);
    setActiveTab('dashboard');
    loadPublicMeta();
  };

  const allowedNavItems = useMemo(() => {
    if (!user) return [];
    const hakList = bootstrap?.hakAkses || [];
    const role = user.role;
    const activeCfg = bootstrap?.pengaturan || publicPengaturan;
    const effectiveJenjang =
      activeCfg.jenjangSekolah ||
      (activeCfg.namaSekolah.toUpperCase().includes('SMP')
        ? 'SMP'
        : activeCfg.namaSekolah.toUpperCase().includes('SMA')
          ? 'SMA'
          : 'SMK');

    return NAV_ITEMS.filter((item) => {
      if (item.id === 'master-jurusan' && effectiveJenjang !== 'SMK') {
        return false;
      }
      if (item.id === 'profile') return true;
      if (item.id === 'pengaturan-sekolah' || item.id === 'master-users' || item.id === 'master-hak-akses') {
        return role === 'admin';
      }
      const rule = hakList.find((h) => h.id === item.id);
      if (!rule) {
        if (role === 'admin') return true;
        return item.id === 'dashboard' || item.id === 'scan';
      }
      if (role === 'admin') return rule.admin;
      if (role === 'guru') return rule.guru;
      if (role === 'karyawan') return rule.karyawan;
      return rule.siswa;
    });
  }, [user, bootstrap?.hakAkses, bootstrap?.pengaturan, publicPengaturan]);

  const groupedNav = useMemo(() => {
    const groups: Array<{ group: string; items: NavItemConfig[] }> = [];
    const order: NavItemConfig['group'][] = ['Utama', 'Akademik & KBM', 'Kesiswaan & Data', 'Administrasi'];
    for (const g of order) {
      const items = allowedNavItems.filter((i) => i.group === g);
      if (items.length > 0) groups.push({ group: g, items });
    }
    return groups;
  }, [allowedNavItems]);

  useEffect(() => {
    if (allowedNavItems.length > 0 && !allowedNavItems.some((item) => item.id === activeTab)) {
      setActiveTab(allowedNavItems[0].id);
    }
  }, [allowedNavItems, activeTab]);

  const handleSelectJadwalForJurnal = (jadwal: JadwalRecord) => {
    setPrefillJadwal(jadwal);
    setActiveTab('jurnal');
    setMobileMenuOpen(false);
  };

  const pengaturan = bootstrap?.pengaturan || publicPengaturan;

  if (metaLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-indigo-50 to-sky-100 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900">
        <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 animate-pulse" />
          <p className="text-sm font-semibold">Memuat Sistem Integrasi Sekolah...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          aria-label="Ubah Tema"
          className="fixed top-4 right-4 z-50 p-2.5 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-md hover:scale-105 transition"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
        </button>
        <LoginView
          pengaturan={pengaturan}
          adminClaimed={adminClaimed}
          metaError={metaError}
          authNotice={authNotice}
          onLoginSuccess={handleLoginSuccess}
          onEndpointUpdated={loadPublicMeta}
        />
      </div>
    );
  }

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Dashboard';

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="p-5 bg-gradient-to-br from-indigo-600 via-violet-600 to-blue-700 text-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center overflow-hidden p-1 shrink-0">
            {pengaturan.logoSekolah ? (
              <img
                src={pengaturan.logoSekolah}
                alt={pengaturan.namaSekolah}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <GraduationCap className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold truncate leading-tight">
              {pengaturan.namaSekolah}
            </h1>
            <p className="text-[11px] text-indigo-100/90 truncate mt-0.5">
              TA {pengaturan.tahunAjaran}
            </p>
          </div>
        </div>

        {/* User Card inside Sidebar */}
        <div className="mt-4 p-3 rounded-xl bg-white/10 border border-white/15">
          <div className="text-xs font-bold truncate">{user.nama}</div>
          <div className="flex items-center justify-between text-[11px] text-indigo-100/85 mt-0.5">
            <span className="uppercase font-semibold">{user.role}</span>
            <span className="font-mono">{user.nisNip}</span>
          </div>
        </div>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groupedNav.map((section) => (
          <div key={section.group}>
            <p className="px-3 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {section.group}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-bold transition"
        >
          <LogOut className="w-4 h-4" />
          <span>Keluar Aplikasi</span>
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    if (!bootstrap) {
      return (
        <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <Activity className="w-8 h-8 text-indigo-600 mx-auto animate-pulse" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Menyiapkan data sekolah...
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardHome
            user={user}
            todayStr={todayStr}
            kalenderHariIni={bootstrap.kalenderHariIni}
            siswa={bootstrap.siswa}
            kehadiran={bootstrap.kehadiran}
            kehadiranPegawai={bootstrap.kehadiranPegawai}
            pembinaan={bootstrap.pembinaan}
            jadwal={bootstrap.jadwal}
            jurnal={bootstrap.jurnal}
            agenda={bootstrap.agenda}
            totalPegawai={bootstrap.users?.filter((u) => u.role === 'guru' || u.role === 'karyawan' || u.role === 'admin').length || 4}
            onSwitchTab={setActiveTab}
            onSelectJadwalForJurnal={handleSelectJadwalForJurnal}
          />
        );
      case 'dash-kehadiran-guru':
        return <LiveTeacherDashboard liveTick={liveTick} />;
      case 'scan':
        return (
          <GpsAttendanceView
            user={user}
            pengaturan={bootstrap.pengaturan}
            kalenderHariIni={bootstrap.kalenderHariIni}
            kehadiranSiswa={bootstrap.kehadiran}
            kehadiranPegawai={bootstrap.kehadiranPegawai}
            onRefresh={refreshBootstrap}
          />
        );
      case 'rekap-pegawai':
        return (
          <DataKehadiranPegawaiView
            user={user}
            todayStr={todayStr}
            kehadiranPegawai={bootstrap.kehadiranPegawai}
            users={bootstrap.users}
            onRefresh={refreshBootstrap}
          />
        );
      case 'kalender-pendidikan':
        return (
          <KalenderPendidikanView
            user={user}
            pengaturan={bootstrap.pengaturan}
            kalender={bootstrap.kalender}
            onRefresh={refreshBootstrap}
          />
        );
      case 'jurnal':
        return (
          <JurnalGuruView
            user={user}
            todayStr={todayStr}
            jadwal={bootstrap.jadwal}
            jurnal={bootstrap.jurnal}
            siswa={bootstrap.siswa}
            kehadiran={bootstrap.kehadiran}
            mapelList={bootstrap.mapel}
            prefillJadwal={prefillJadwal}
            onClearPrefill={() => setPrefillJadwal(null)}
            onGoToJadwal={() => setActiveTab('guru-jadwal')}
            onRefresh={refreshBootstrap}
          />
        );
      case 'input':
        return (
          <AbsensiKelasView
            todayStr={todayStr}
            siswa={bootstrap.siswa}
            kehadiran={bootstrap.kehadiran}
            onRefresh={refreshBootstrap}
          />
        );
      case 'guru-jadwal':
        return (
          <KelolaJadwalGuruView
            user={user}
            jadwal={bootstrap.jadwal}
            siswa={bootstrap.siswa}
            mapelList={bootstrap.mapel}
            onRefresh={refreshBootstrap}
          />
        );
      case 'master-jadwal':
        return <MasterJadwalView user={user} jadwal={bootstrap.jadwal} />;
      case 'monitoring':
        return <MonitoringJurnalView jurnal={bootstrap.jurnal} />;
      case 'tugas-digital':
        return (
          <TugasDigitalView
            user={user}
            mapelList={bootstrap.mapel}
            historiTugas={bootstrap.historiTugas}
            onRefresh={refreshBootstrap}
          />
        );
      case 'pembinaan':
        return (
          <PembinaanView
            user={user}
            pengaturan={bootstrap.pengaturan}
            siswa={bootstrap.siswa}
            pembinaan={bootstrap.pembinaan}
            onRefresh={refreshBootstrap}
          />
        );
      case 'rekap-siswa':
        return (
          <RekapSiswaView
            user={user}
            todayStr={todayStr}
            pengaturan={bootstrap.pengaturan}
            siswa={bootstrap.siswa}
            kehadiran={bootstrap.kehadiran}
          />
        );
      case 'rekap-akademik-admin':
        return (
          <RekapAkademikView
            user={user}
            pengaturan={bootstrap.pengaturan}
            siswa={bootstrap.siswa}
            mapelList={bootstrap.mapel}
            jadwal={bootstrap.jadwal}
            nilaiSiswa={bootstrap.nilaiSiswa || []}
            onRefresh={refreshBootstrap}
          />
        );
      case 'master-siswa':
        return (
          <DataSiswaView
            user={user}
            siswa={bootstrap.siswa}
            onRefresh={refreshBootstrap}
          />
        );
      case 'master-jurusan': {
        const effectiveJenjang =
          bootstrap.pengaturan.jenjangSekolah ||
          (bootstrap.pengaturan.namaSekolah.toUpperCase().includes('SMP')
            ? 'SMP'
            : bootstrap.pengaturan.namaSekolah.toUpperCase().includes('SMA')
              ? 'SMA'
              : 'SMK');
        if (effectiveJenjang !== 'SMK') return null;
        return (
          <JurusanView
            user={user}
            pengaturan={bootstrap.pengaturan}
            jurusan={bootstrap.jurusan}
            onRefresh={refreshBootstrap}
          />
        );
      }
      case 'master-users':
        return (
          <DataPenggunaView
            users={bootstrap.users}
            onRefresh={refreshBootstrap}
          />
        );
      case 'master-hak-akses':
        return (
          <HakAksesView
            hakAkses={bootstrap.hakAkses}
            onRefresh={refreshBootstrap}
          />
        );
      case 'pengaturan-sekolah':
        return (
          <PengaturanSekolahView
            pengaturan={bootstrap.pengaturan}
            mysqlConfigured={Boolean(bootstrap.mysqlConfigured)}
            supabaseConfigured={bootstrap.supabaseConfigured}
            liveTick={liveTick}
            onRefresh={refreshBootstrap}
          />
        );
      case 'profile':
        return <ProfileView user={user} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-indigo-50/40 to-sky-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/30 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full shadow-2xl z-10 flex flex-col">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Tutup Menu"
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/15 text-white hover:bg-white/25"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Buka Menu"
                className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                  {activeNavLabel}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                  {pengaturan.alamatSekolah}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="hidden md:flex flex-col items-end text-right pr-2 border-r border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {todayText}
                </span>
                <span className="text-xs font-extrabold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  {clockText} WIB
                </span>
              </div>

              <button
                type="button"
                onClick={() => refreshBootstrap()}
                disabled={bootstrapLoading}
                title="Sinkronkan Data"
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                <RefreshCw className={`w-4 h-4 ${bootstrapLoading ? 'animate-spin text-indigo-600' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setDarkMode((d) => !d)}
                title={darkMode ? 'Mode Terang' : 'Mode Gelap'}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
              </button>
            </div>
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto space-y-5">
          {globalError && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex flex-wrap items-center justify-between gap-2">
              <span>{globalError}</span>
              <button
                type="button"
                onClick={() => setGlobalError(null)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold"
              >
                Tutup
              </button>
            </div>
          )}

          {renderContent()}
        </main>

        {/* Footer */}
        <footer className="px-4 sm:px-6 pt-4 pb-24 lg:pb-4 border-t border-slate-200/80 dark:border-slate-800 text-center text-[11px] text-slate-500 dark:text-slate-400">
          <div className="max-w-7xl mx-auto">
            <span>{pengaturan.footerApp}</span>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Quick-Access Icon Menu (HP) */}
      <nav
        aria-label="Menu Akses Cepat HP"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(15,23,42,0.08)]"
      >
        <div className="grid grid-flow-col auto-cols-fr items-center h-16 px-1">
          {[
            { id: 'dashboard', label: 'Beranda', title: 'Dashboard Utama', icon: LayoutDashboard },
            { id: 'scan', label: 'Presensi', title: 'Presensi GPS', icon: MapPin },
            { id: 'rekap-pegawai', label: 'Pegawai', title: 'Kehadiran Pegawai', icon: UserCheck },
            { id: 'jurnal', label: 'Jurnal', title: 'Jurnal Harian', icon: BookOpen },
            { id: 'profile', label: 'Profil', title: 'Profile', icon: UserCircle },
          ]
            .filter((item) => item.id === 'profile' || allowedNavItems.some((nav) => nav.id === item.id))
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.title}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl transition ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/50'
                      : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="text-[10px] font-bold leading-none truncate max-w-full">
                    {item.label}
                  </span>
                </button>
              );
            })}

          <button
            type="button"
            title="Keluar Aplikasi"
            onClick={handleLogout}
            className="min-h-[48px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="text-[10px] font-bold leading-none truncate max-w-full">Keluar</span>
          </button>
        </div>
      </nav>

      {toastMessage && (
        <div className="fixed bottom-20 right-6 z-50 max-w-sm w-full bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md border border-indigo-500/35 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 animate-bounce">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-indigo-300">{toastMessage.title}</h4>
              <span className="text-[10px] font-mono text-slate-400">{toastMessage.time}</span>
            </div>
            <p className="text-xs font-semibold text-slate-100 truncate mt-0.5">{toastMessage.desc}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
