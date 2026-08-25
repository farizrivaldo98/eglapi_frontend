import { useState, useEffect, useRef } from "react";
import { Text, Badge, Button, SimpleGrid, useToast } from "@chakra-ui/react";
import pm5350Photo from "../assets/scada/schneider-pm5350.png";

// ═══════════════════════════════════════════════════════════════════
// EnergyMeter — Tab "Energy Meter" pada Scadamonitor.jsx
// 3x Ultrasonic Flow Meter + 10x Power Meter (Schneider PM5350),
// display model SCADA — value tampil langsung di dalam gambar device
// (SVG), sama seperti tab EMS.
//
// Alur data:
//   1) connectWS()  → subscribe ke Node-RED via WebSocket, payload:
//        { data: { <TAG>: <value>, ... } }
//      persis pola yang sama dengan EnvironmentManagementSystem.jsx.
//   2) Selama WebSocket belum "live" (Node-RED belum jalan/belum
//      dikonfigurasi), komponen ini men-generate angka random tiap
//      2 detik supaya tampilan tetap "hidup" — begitu WS live, generator
//      random otomatis berhenti dan value asli dari PLC/Meter yang dipakai.
//
// Tag naming — SUDAH disamakan persis dengan nama yang dipakai di flow
// Node-RED (function "Simpan Data Power Meter Terbaru" & "Simpan Data
// Flow Meter Terbaru"). <NAMA> = tag persis seperti di POWER_METERS /
// FLOW_METERS di bawah (mis. "SDP1-OFC1", "PP_Chiller", "PWG_Return"):
//   Flow meter (SW_Supplay, PWG_Return, PDAM_Supplay):
//     <NAMA>_Flow    → laju alir realtime, m³/h
//     <NAMA>_Total   → totalizer akumulatif, m³
//     <NAMA>_Status  → "RUN" | "STOP"
//   Power meter (PP_UTY1, PP_LAPI1, SDP2-PRO1, SDP1-OFC1, PP_Chiller,
//                SDP1-OFC23, SDP2-PRO2, SDP1-OFC45, SDP2-OFC45, SDP-MC):
//     <NAMA>_V       → tegangan, V
//     <NAMA>_A       → arus, A
//     <NAMA>_kW      → daya aktif, kW
//     <NAMA>_kWh     → energi kumulatif, kWh
// ═══════════════════════════════════════════════════════════════════

// Endpoint Node-RED khusus Energy Meter — path terpisah dari /ws/scada (AHU),
// dilayani websocket-listener baru "/ws/energy" + node "WS Out - /ws/energy",
// dipicu dari function "Simpan Data Power Meter Terbaru" & "Simpan Data
// Flow Meter Terbaru". Sesuaikan host/port kalau Node-RED tidak jalan di
// 10.163.0.66:1880.
const ENERGY_WS_URL = "ws://10.163.0.66:1880/ws/energy";

const STATUS_DOT_COLOR = {
  live: "bg-green-500",
  connecting: "bg-orange-500",
  down: "bg-red-500",
};

const FLOW_METERS = [
  { tag: "SW_Supplay", label: "SW_Supplay" },
  { tag: "PWG_Return", label: "PWG_Input" },
  { tag: "PDAM_Supplay", label: "PDAM_Supplay" },
];

const POWER_METERS = [
  { tag: "PP_UTY1", label: "PP_UTY1" },
  { tag: "PP_LAPI1", label: "PP_LAPI1" },
  { tag: "SDP2-PRO1", label: "SDP2-PRO1" },
  { tag: "SDP1-OFC1", label: "SDP1-OFC1" },
  { tag: "PP_Chiller", label: "PP_Chiller" },
  { tag: "SDP1-OFC23", label: "SDP1-OFC23" },
  { tag: "SDP2-PRO2", label: "SDP2-PRO2" },
  { tag: "SDP1-OFC45", label: "SDP1-OFC45" },
  { tag: "SDP2-OFC45", label: "SDP2-OFC45" },
  { tag: "SDP-MC", label: "SDP-MC" },
];

const getFlowTags = (tag) => ({
  flow: `${tag}_Flow`,
  total: `${tag}_Total`,
  status: `${tag}_Status`,
});
const getPowerTags = (tag) => ({
  v: `${tag}_V`,
  a: `${tag}_A`,
  kw: `${tag}_kW`,
  kwh: `${tag}_kWh`,
});

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// ─────────────────────────────────────────────────────────────────
export default function EnergyMeter() {
  const [data, setData] = useState({});
  const [status, setStatus] = useState("down");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [now, setNow] = useState(Date.now());

  const wsRef = useRef(null);
  const simRef = useRef({}); // penyimpan angka simulasi per tag (persist antar tick)
  const toast = useToast();

  // ──────────────── WebSocket ────────────────────────────────────
  const connectWS = () => {
    setStatus("connecting");
    wsRef.current?.close();
    const ws = new WebSocket(ENERGY_WS_URL);

    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus("down");
    ws.onerror = () => setStatus("down");

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.data) {
          setData((prev) => ({ ...prev, ...payload.data }));
          setLastUpdate(Date.now());
        }
      } catch (e) {
        console.error("WS Parse Error:", e);
      }
    };

    wsRef.current = ws;
  };

  useEffect(() => {
    connectWS();
    return () => wsRef.current?.close();
  }, []);

  // Tick tiap 1 detik untuk "X detik lalu"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ──────────────── Simulasi angka random ────────────────────────
  // Aktif selama status !== "live". Begitu WS Node-RED benar-benar
  // konek & kirim data, simulasi berhenti otomatis (lihat guard di atas).
  useEffect(() => {
    const id = setInterval(() => {
      if (status === "live") return;

      setData((prev) => {
        const next = { ...prev };

        FLOW_METERS.forEach(({ tag }) => {
          const t = getFlowTags(tag);
          if (!simRef.current[tag]) {
            simRef.current[tag] = { flow: 30 + Math.random() * 40, total: Math.random() * 20000 };
          }
          const s = simRef.current[tag];
          s.flow = clamp(s.flow + (Math.random() - 0.5) * 8, 0, 180);
          s.total += s.flow / 1800; // akumulasi per 2 detik (m³/h → m³)

          next[t.flow] = s.flow;
          next[t.total] = s.total;
          next[t.status] = s.flow > 2 ? "RUN" : "STOP";
        });

        POWER_METERS.forEach(({ tag }, i) => {
          const t = getPowerTags(tag);
          if (!simRef.current[tag]) {
            simRef.current[tag] = {
              v: 218 + Math.random() * 6,
              a: 8 + i * 7 + Math.random() * 5,
              pf: 0.88 + Math.random() * 0.08,
              kwh: Math.random() * 50000,
            };
          }
          const s = simRef.current[tag];
          s.v = clamp(s.v + (Math.random() - 0.5) * 2, 200, 240);
          s.a = clamp(s.a + (Math.random() - 0.5) * 4, 0, 160);
          const kw = (s.v * s.a * 1.732 * s.pf) / 1000;
          s.kwh += kw / 1800; // akumulasi per 2 detik (kW → kWh)

          next[t.v] = s.v;
          next[t.a] = s.a;
          next[t.kw] = kw;
          next[t.kwh] = s.kwh;
        });

        return next;
      });

      // Simulasi juga "menghidupkan" jam terakhir-update supaya status bar masuk akal
      setLastUpdate(Date.now());
    }, 2000);

    return () => clearInterval(id);
  }, [status]);

  // ──────────────── Format waktu ─────────────────────────────────
  const elapsedSec = lastUpdate ? Math.floor((now - lastUpdate) / 1000) : null;
  const fmtElapsed = (s) => (s < 60 ? `${s} detik lalu` : `${Math.floor(s / 60)} menit lalu`);
  const simulating = status !== "live";

  const handleReconnect = () => {
    connectWS();
    toast({ title: "Mencoba konek ulang WebSocket…", status: "info", duration: 2000 });
  };

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="p-4 flex gap-4 items-center flex-wrap">
        <Button onClick={handleReconnect} size="sm" colorScheme="blue">
          Reconnect WS
        </Button>

        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {status !== "down" && (
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${STATUS_DOT_COLOR[status]}`}
              />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${STATUS_DOT_COLOR[status]}`} />
          </span>
          <Text fontSize="sm" fontWeight="semibold">{status.toUpperCase()}</Text>
        </div>

        {simulating && (
          <Badge colorScheme="yellow">Data simulasi — menunggu WebSocket Node-RED</Badge>
        )}

        {elapsedSec !== null && (
          <Text fontSize="xs" color="gray.500">
            Data terakhir: {fmtElapsed(elapsedSec)}
          </Text>
        )}
      </div>

      {/* ── Ultrasonic Flow Meter ────────────────────────────────── */}
      <div className="mx-6 mb-6">
        <Text fontSize="md" fontWeight="bold" mb={3}>
          Ultrasonic Flow Meter
        </Text>
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} spacing={6}>
          {FLOW_METERS.map(({ tag, label }) => {
            const t = getFlowTags(tag);
            return (
              <div key={tag} className="bg-card rounded-md shadow-lg p-4 flex justify-center">
                <FlowMeterDisplay
                  uid={tag}
                  label={label}
                  flow={data[t.flow]}
                  status={data[t.status]}
                  total={data[t.total]}
                />
              </div>
            );
          })}
        </SimpleGrid>
      </div>

      {/* ── Power Meter ──────────────────────────────────────────── */}
      <div className="mx-6 mb-6">
        <Text fontSize="md" fontWeight="bold" mb={3}>
          Power Meter
        </Text>
        <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 5 }} spacing={6}>
          {POWER_METERS.map(({ tag, label }) => {
            const t = getPowerTags(tag);
            return (
              <div key={tag} className="bg-card rounded-md shadow-lg p-3 flex justify-center">
                <PowerMeterDisplay
                  label={label}
                  v={data[t.v]}
                  a={data[t.a]}
                  kw={data[t.kw]}
                  kwh={data[t.kwh]}
                />
              </div>
            );
          })}
        </SimpleGrid>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PowerMeterDisplay — foto Schneider PM5350, value ditulis di atas
// layar LCD kosong pakai <text> SVG (posisi dikalibrasi ke foto asli).
// ═══════════════════════════════════════════════════════════════════
// function PowerMeterDisplay({ label, v, a, kw, kwh }) {
//   const line = (val, digits, unit) =>
//     typeof val === "number" ? `${val.toFixed(digits)} ${unit}` : `— ${unit}`;
function PowerMeterDisplay({ label, v, a, kw, kwh }) {
  // Fungsi ini sekarang hanya memformat angkanya saja, tanpa satuan
  const formatVal = (val, digits) =>
    typeof val === "number" ? val.toFixed(digits) : "—";

  return (
   <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 1280 1120" className="w-full h-auto" style={{ maxWidth: 300 }}>
        <image
          href={pm5350Photo}
          x="0"
          y="0"
          width="1280"
          height="1120"
          preserveAspectRatio="xMidYMid meet"
        />
        <g fontFamily="'Digital-7 Mono', monospace" fontWeight="normal" fill="#1f2a1f">
          
          {/* Kolom Angka - Dimulai di kordinat X=280 */}
          <text x="380" y="380" fontSize="100">{formatVal(v, 1)}</text>
          <text x="380" y="500" fontSize="100">{formatVal(a, 1)}</text>
          <text x="380" y="610" fontSize="100">{formatVal(kw, 2)}</text>
          <text x="380" y="720" fontSize="100">{formatVal(kwh, 1)}</text>

          {/* Kolom Satuan - Sejajar lurus di kordinat X=820 */}
          <text x="820" y="380" fontSize="100">V</text>
          <text x="820" y="500" fontSize="100">A</text>
          <text x="820" y="610" fontSize="100">KW</text>
          <text x="820" y="720" fontSize="100">KWH</text>
          
        </g>
      </svg>
      <Text fontSize="sm" fontWeight="bold">{label}</Text>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FlowMeterDisplay — device digambar full vector (bukan foto), value
// ditulis langsung ke elemen <text> layar LCD-nya.
// `uid` dipakai untuk bikin id gradient/filter unik per instance
// (supaya 3 meter di 1 halaman tidak rebutan id yang sama).
// ═══════════════════════════════════════════════════════════════════
function FlowMeterDisplay({ uid, label, flow, status, total, unit = "m³/h" }) {
  const flowText = typeof flow === "number" ? flow.toFixed(4) : "0.0000";
  const totalText = typeof total === "number" ? total.toFixed(1) : "0.0";
  const statusText = status ?? "—";
  const statusColor = statusText === "RUN" ? "#0b2c00" : statusText === "STOP" ? "#7f1d1d" : "#555";

  const gBody = `body-${uid}`;
  const gEdge = `edge-${uid}`;
  const gPanel = `panel-${uid}`;
  const gScreen = `screen-${uid}`;
  const fShadow = `shadow-${uid}`;
  const fSoft = `soft-${uid}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="50 0 800 1000" className="w-full h-auto" style={{ maxWidth: 300 }}>
        <defs>
          <linearGradient id={gBody} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1672b5" />
            <stop offset="0.48" stopColor="#07568f" />
            <stop offset="1" stopColor="#0b4775" />
          </linearGradient>
          <linearGradient id={gEdge} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2b83bd" />
            <stop offset="1" stopColor="#07446f" />
          </linearGradient>
          <linearGradient id={gPanel} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4e5e69" />
            <stop offset="1" stopColor="#2e3a42" />
          </linearGradient>
          <linearGradient id={gScreen} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d3ef6f" />
            <stop offset="1" stopColor="#a9d74c" />
          </linearGradient>
          <filter id={fShadow} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="14" stdDeviation="14" floodOpacity="0.24" />
          </filter>
          <filter id={fSoft} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        {/* rear mounting tabs */}
        <g opacity="0.95">
          <path d="M70 175h-38q-12 0-12 12v74q0 12 12 12h38" fill="#7a848b" />
          <circle cx="40" cy="212" r="10" fill="#d9dde0" stroke="#4c565e" strokeWidth="4" />
          <path d="M830 175h38q12 0 12 12v74q0 12-12 12h-38" fill="#7a848b" />
          <circle cx="860" cy="212" r="10" fill="#d9dde0" stroke="#4c565e" strokeWidth="4" />
          <path d="M70 650h-38q-12 0-12 12v74q0 12 12 12h38" fill="#7a848b" />
          <circle cx="40" cy="687" r="10" fill="#d9dde0" stroke="#4c565e" strokeWidth="4" />
          <path d="M830 650h38q12 0 12 12v74q0 12-12 12h-38" fill="#7a848b" />
          <circle cx="860" cy="687" r="10" fill="#d9dde0" stroke="#4c565e" strokeWidth="4" />
        </g>

        {/* main enclosure */}
        <g filter={`url(#${fShadow})`}>
          <rect x="55" y="70" width="790" height="740" rx="62" fill="#8b969d" />
          <rect x="70" y="55" width="760" height="740" rx="56" fill={`url(#${gBody})`} stroke="#0c3f66" strokeWidth="8" />
          <rect x="92" y="78" width="716" height="694" rx="43" fill={`url(#${gEdge})`} stroke="#2e8cc8" strokeWidth="5" />

          <path d="M130 110h540q48 0 72 38l14 22H110l15-25q22-35 65-35z" fill="#1a78b7" opacity="0.7" />

          <g>
            <circle cx="115" cy="102" r="18" fill="#39444b" stroke="#10161a" strokeWidth="4" />
            <circle cx="115" cy="102" r="8" fill="#b8c0c4" />
            <path d="M108 95l14 14" stroke="#5a666d" strokeWidth="3" />
            <circle cx="785" cy="102" r="18" fill="#39444b" stroke="#10161a" strokeWidth="4" />
            <circle cx="785" cy="102" r="8" fill="#b8c0c4" />
            <path d="M778 95l14 14" stroke="#5a666d" strokeWidth="3" />
            <circle cx="115" cy="750" r="18" fill="#39444b" stroke="#10161a" strokeWidth="4" />
            <circle cx="115" cy="750" r="8" fill="#b8c0c4" />
            <path d="M108 743l14 14" stroke="#5a666d" strokeWidth="3" />
            <circle cx="785" cy="750" r="18" fill="#39444b" stroke="#10161a" strokeWidth="4" />
            <circle cx="785" cy="750" r="8" fill="#b8c0c4" />
            <path d="M778 743l14 14" stroke="#5a666d" strokeWidth="3" />
          </g>

          <rect x="192" y="195" width="516" height="475" rx="32" fill={`url(#${gPanel})`} stroke="#89949b" strokeWidth="7" />

          <rect x="230" y="225" width="440" height="150" rx="10" fill="#8d969a" stroke="#2b3136" strokeWidth="5" />
          <rect x="248" y="242" width="404" height="116" rx="2" fill={`url(#${gScreen})`} stroke="#344000" strokeWidth="5" />

          {/* SCADA value area inside LCD — live data */}
          <g fontFamily="Consolas, 'Courier New', monospace" fill="#0b2c00">
            <text x="270" y="285" fontSize="40" fontWeight="700">Flow</text>
            <text x="380" y="285" fontSize="40" fontWeight="700">{flowText} {unit}</text>
            {/* <text x="270" y="309" fontSize="30">Rate</text>
            <text x="380" y="309" fontSize="30" fontWeight="700" fill={statusColor}>{statusText}</text> */}
            <text x="270" y="340" fontSize="40" fontWeight="700">NET</text>
            <text x="380" y="340" fontSize="40" fontWeight="700">{totalText} m³</text>
          </g>

          {/* keypad (dekoratif, statis) */}
          <g fontFamily="Arial, sans-serif" fontSize="19" textAnchor="middle">
            <g fill="#626b70" stroke="#aeb5b9" strokeWidth="3">
              <rect x="252" y="405" width="62" height="48" rx="22" /><rect x="334" y="405" width="62" height="48" rx="22" /><rect x="416" y="405" width="62" height="48" rx="22" /><rect x="498" y="405" width="84" height="48" rx="22" />
              <rect x="252" y="470" width="62" height="48" rx="22" /><rect x="334" y="470" width="62" height="48" rx="22" /><rect x="416" y="470" width="62" height="48" rx="22" /><rect x="498" y="470" width="84" height="48" rx="22" />
              <rect x="252" y="535" width="62" height="48" rx="22" /><rect x="334" y="535" width="62" height="48" rx="22" /><rect x="416" y="535" width="62" height="48" rx="22" /><rect x="498" y="535" width="84" height="48" rx="22" />
              <rect x="252" y="600" width="62" height="48" rx="22" /><rect x="334" y="600" width="62" height="48" rx="22" /><rect x="416" y="600" width="62" height="48" rx="22" /><rect x="498" y="600" width="84" height="48" rx="22" />
            </g>
            <g fill="#f0f3f4" fontWeight="700">
              <text x="283" y="436">7</text><text x="365" y="436">8</text><text x="447" y="436">9</text><text x="540" y="436" fontSize="16">MENU</text>
              <text x="283" y="501">4</text><text x="365" y="501">5</text><text x="447" y="501">6</text><text x="540" y="501" fontSize="20">▲/+</text>
              <text x="283" y="566">1</text><text x="365" y="566">2</text><text x="447" y="566">3</text><text x="540" y="566" fontSize="20">▼/−</text>
              <text x="283" y="631">0</text><text x="365" y="631">.</text><text x="447" y="631">◀</text><text x="540" y="631" fontSize="16" fill="#ffffff">ENT</text>
            </g>
            <rect x="498" y="600" width="84" height="48" rx="22" fill="#9c2f30" stroke="#c98c8c" strokeWidth="3" />
            <text x="540" y="631" fill="#fff" fontWeight="700" fontSize="16">ENT</text>
          </g>

          {/* warning label (dekoratif, statis) */}
          <g>
            <rect x="320" y="695" width="260" height="46" rx="4" fill="#e6ddc7" stroke="#a2a0a0" strokeWidth="2" />
            <polygon points="343,705 357,730 329,730" fill="#f2c400" stroke="#4d4d4d" strokeWidth="2" />
            <text x="352" y="726" textAnchor="middle" fontFamily="Arial" fontSize="15" fontWeight="700">!</text>
            <text x="445" y="717" textAnchor="middle" fontFamily="Arial" fontSize="10" fill="#414141">CAUTION</text>
            <text x="445" y="731" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#414141">Do not open the cover</text>
          </g>
        </g>

        {/* cable glands (dekoratif, statis) */}
        <g>
          <g transform="translate(150 795)">
            <rect x="0" y="0" width="90" height="72" rx="14" fill="#171c20" />
            <rect x="10" y="18" width="70" height="52" rx="12" fill="#23292d" />
            <path d="M8 30h74M8 42h74M8 54h74" stroke="#495158" strokeWidth="5" />
          </g>
          <g transform="translate(292 795)">
            <rect x="0" y="0" width="90" height="72" rx="14" fill="#171c20" />
            <rect x="10" y="18" width="70" height="52" rx="12" fill="#23292d" />
            <path d="M8 30h74M8 42h74M8 54h74" stroke="#495158" strokeWidth="5" />
          </g>
          <g transform="translate(434 795)">
            <rect x="0" y="0" width="90" height="72" rx="14" fill="#171c20" />
            <rect x="10" y="18" width="70" height="52" rx="12" fill="#23292d" />
            <path d="M8 30h74M8 42h74M8 54h74" stroke="#495158" strokeWidth="5" />
          </g>
          <g transform="translate(576 795)">
            <rect x="0" y="0" width="90" height="72" rx="14" fill="#171c20" />
            <rect x="10" y="18" width="70" height="52" rx="12" fill="#23292d" />
            <path d="M8 30h74M8 42h74M8 54h74" stroke="#495158" strokeWidth="5" />
          </g>
        </g>

        <ellipse cx="450" cy="895" rx="285" ry="34" fill="#1d252b" opacity="0.16" filter={`url(#${fSoft})`} />
      </svg>
      <Text fontSize="sm" fontWeight="bold">{label}</Text>
    </div>
  );
}