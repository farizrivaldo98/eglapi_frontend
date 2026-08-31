import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Text, Badge, Button, SimpleGrid, useToast,
  FormControl, FormLabel, Input, Select, NumberInput, NumberInputField,
  Stat, StatLabel, StatNumber, Divider, RadioGroup, Radio, Stack,
  Table, Thead, Tbody, Tr, Th, Td, Spinner,
} from "@chakra-ui/react";
//import CanvasJSReact from "@canvasjs/react-charts"; // TODO: samain sama import CanvasJS yang udah dipakai di halaman lain kalau beda
import CanvasJSReact from "../canvasjs.react";
const CanvasJSChart = CanvasJSReact.CanvasJSChart;

// ═══════════════════════════════════════════════════════════════════
// Machine.jsx — Realtime + Historikal Parameter + Running Hours (Run vs
// Stop, per hari & per shift) untuk mesin produksi.
//
// Backend yang dipakai (lihat databaseControllers.js bagian "MACHINE"):
//   GET  /getMachineConfig
//   GET  /getMachineHistorical?machine=&start=&finish=
//   GET  /getMachineRunningHours?machine=&start=&finish=&flowCol=&threshold=
//        &shift1Start=&shift1End=&shift2Start=&shift2End=&shift3Start=&shift3End=
//   GET  /getMachineShiftConfig
//   POST /updateMachineShiftConfig
//
// Deteksi RUNNING/STOP: parameter acuan (default sesuai mesin, mis. Speed
// Motor buat FBD_GEA) dibandingkan ke threshold (default 200) - kalau nilai
// > threshold dianggap RUNNING, selain itu STOP. Threshold & parameter
// acuan bisa diganti langsung dari tab "Running Hours".
//
// Shift: 1 hari dibagi 3 shift, jam mulai/selesai tiap shift bisa diseting
// sendiri (disimpan di backend, dipakai lagi tiap kali halaman dibuka).
// Shift yang nyebrang tengah malam (mis. 22:00-06:00) didukung.
// ═══════════════════════════════════════════════════════════════════

// TODO: sesuaikan sama base URL backend Express kamu (samain kayak axios
// instance yang udah ada di halaman lain, kalau ada).
const API_BASE_URL = "http://10.163.0.66:8002/part";

// Path WebSocket Node-RED per mesin - samain pola sama ENERGY_WS_URL di
// EnergyMeter.jsx. Tambah entry baru kalau nambah machine key baru di
// MACHINE_CONFIG (backend).
const MACHINE_WS_URLS = {
  fbd_gea: "ws://10.163.0.66:1880/ws/fbdgea",
};

const RUN_COLOR = "#38a169";
const STOP_COLOR = "#e53e3e";

async function apiGet(path, params) {
  const url = new URL(API_BASE_URL + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Gagal memuat ${path}`);
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Gagal menyimpan ${path}`);
  return data;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────────────────
export default function Machine() {
  const toast = useToast();

  const [machineConfig, setMachineConfig] = useState([]);
  const [machineKey, setMachineKey] = useState("");
  const cfg = machineConfig.find((m) => m.key === machineKey);

  useEffect(() => {
    apiGet("/getMachineConfig")
      .then((res) => {
        const list = res.machines || [];
        setMachineConfig(list);
        setMachineKey((prev) => (list.find((m) => m.key === prev) ? prev : list[0]?.key || ""));
      })
      .catch((err) =>
        toast({ title: "Gagal memuat konfigurasi mesin", description: err.message, status: "error" })
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deteksi RUNNING/STOP - dipakai bareng di tab Realtime & Running Hours,
  // jadi disimpan di parent supaya konsisten.
  const [flowCol, setFlowCol] = useState(0);
  const [threshold, setThreshold] = useState(200);
  useEffect(() => {
    if (cfg) {
      setFlowCol(cfg.defaultFlowCol ?? 0);
      setThreshold(cfg.defaultThreshold ?? 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.key]);

  return (
    <div className="flex flex-col min-h-screen bg-background p-4 gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Text fontSize="xl" fontWeight="bold">Machine</Text>
        <Select w="220px" size="sm" value={machineKey} onChange={(e) => setMachineKey(e.target.value)}>
          {machineConfig.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </Select>
      </div>

      {!cfg ? (
        <div className="flex items-center gap-2 p-8 justify-center">
          <Spinner size="sm" />
          <Text>Memuat konfigurasi mesin…</Text>
        </div>
      ) : (
        <Tabs colorScheme="blue" isLazy>
          <TabList>
            <Tab>Realtime</Tab>
            <Tab>Historikal Parameter</Tab>
            <Tab>Running Hours</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <MachineRealtime cfg={cfg} wsUrl={MACHINE_WS_URLS[machineKey]} flowCol={flowCol} threshold={threshold} />
            </TabPanel>
            <TabPanel px={0}>
              <MachineHistorical cfg={cfg} machineKey={machineKey} />
            </TabPanel>
            <TabPanel px={0}>
              <MachineRunningHours
                cfg={cfg}
                machineKey={machineKey}
                flowCol={flowCol}
                setFlowCol={setFlowCol}
                threshold={threshold}
                setThreshold={setThreshold}
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MachineRealtime — kartu nilai realtime per parameter (WebSocket ke
// Node-RED, payload { data: { <key>: value, ... } }) + badge RUNNING/STOP.
// ═══════════════════════════════════════════════════════════════════
function MachineRealtime({ cfg, wsUrl, flowCol, threshold }) {
  const [data, setData] = useState({});
  const [status, setStatus] = useState("down");
  const [lastUpdate, setLastUpdate] = useState(null);
  const wsRef = useRef(null);
  const toast = useToast();

  const connectWS = useCallback(() => {
    if (!wsUrl) return;
    setStatus("connecting");
    wsRef.current?.close();
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus("down");
    ws.onerror = () => setStatus("down");
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.data) {
          setData(payload.data);
          setLastUpdate(Date.now());
        }
      } catch (e) {
        console.error("WS Parse Error:", e);
      }
    };
    wsRef.current = ws;
  }, [wsUrl]);

  useEffect(() => {
    connectWS();
    return () => wsRef.current?.close();
  }, [connectWS]);

  const flowParam = cfg.params.find((p) => p.col === Number(flowCol));
  const flowValue = flowParam ? data[flowParam.key] : undefined;
  const isRunning = typeof flowValue === "number" && flowValue > threshold;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Button
          size="sm"
          colorScheme="blue"
          onClick={() => {
            connectWS();
            toast({ title: "Mencoba konek ulang WebSocket…", status: "info", duration: 2000 });
          }}
        >
          Reconnect WS
        </Button>

        <div className="flex items-center gap-2">
          <span
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              status === "live" ? "bg-green-500" : status === "connecting" ? "bg-orange-500" : "bg-red-500"
            }`}
          />
          <Text fontSize="sm" fontWeight="semibold">{status.toUpperCase()}</Text>
        </div>

        <Badge colorScheme={isRunning ? "green" : "red"} fontSize="sm" px={2} py={1}>
          {isRunning ? "RUNNING" : "STOP"}
        </Badge>

        {lastUpdate && (
          <Text fontSize="xs" color="gray.500">
            Data terakhir: {new Date(lastUpdate).toLocaleTimeString("id-ID")}
          </Text>
        )}
      </div>

      <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={4}>
        {cfg.params.map((p) => (
          <div key={p.key} className="bg-card rounded-md shadow-lg p-4">
            <Stat>
              <StatLabel>{p.label}</StatLabel>
              <StatNumber>
                {typeof data[p.key] === "number" ? data[p.key].toFixed(2) : "—"}{" "}
                <Text as="span" fontSize="sm" color="gray.500">{p.unit}</Text>
              </StatNumber>
              <Text fontSize="xs" color="gray.400">{p.tag}</Text>
            </Stat>
          </div>
        ))}
      </SimpleGrid>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MachineHistorical — grafik historikal tiap parameter (line chart per
// parameter, bisa pilih parameter mana yang mau ditampilkan).
// ═══════════════════════════════════════════════════════════════════
function MachineHistorical({ cfg, machineKey }) {
  const toast = useToast();
  const [start, setStart] = useState(`${daysAgoStr(1)}T00:00`);
  const [finish, setFinish] = useState(`${todayStr()}T23:59`);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(cfg.params.map((p) => p.key));

  useEffect(() => {
    setSelectedKeys(cfg.params.map((p) => p.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.key]);

  const fetchData = useCallback(() => {
    setLoading(true);
    apiGet("/getMachineHistorical", {
      machine: machineKey,
      start: start.replace("T", " ") + ":00",
      finish: finish.replace("T", " ") + ":00",
    })
      .then((res) => setRows(Array.isArray(res) ? res : []))
      .catch((err) => toast({ title: "Gagal memuat data historikal", description: err.message, status: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineKey, start, finish]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineKey]);

  const toggleKey = (key) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3 flex-wrap">
        <FormControl w="220px">
          <FormLabel fontSize="sm">Mulai</FormLabel>
          <Input size="sm" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormControl>
        <FormControl w="220px">
          <FormLabel fontSize="sm">Selesai</FormLabel>
          <Input size="sm" type="datetime-local" value={finish} onChange={(e) => setFinish(e.target.value)} />
        </FormControl>
        <Button size="sm" colorScheme="blue" onClick={fetchData} isLoading={loading}>Tampilkan</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {cfg.params.map((p) => (
          <Badge
            key={p.key}
            as="button"
            onClick={() => toggleKey(p.key)}
            colorScheme={selectedKeys.includes(p.key) ? "blue" : "gray"}
            variant={selectedKeys.includes(p.key) ? "solid" : "outline"}
            px={2}
            py={1}
            borderRadius="md"
            cursor="pointer"
          >
            {p.label}
          </Badge>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Spinner /></div>
      ) : (
        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
          {cfg.params
            .filter((p) => selectedKeys.includes(p.key))
            .map((p) => (
              <div key={p.key} className="bg-card rounded-md shadow-lg p-2">
                <CanvasJSChart
                  options={{
                    animationEnabled: true,
                    theme: "light2",
                    title: { text: `${p.label} (${p.unit})`, fontSize: 14 },
                    axisX: { valueFormatString: "DD MMM HH:mm" },
                    axisY: { title: p.unit },
                    data: [
                      {
                        type: "line",
                        xValueType: "dateTime",
                        dataPoints: rows.map((r) => ({ x: new Date(r.date), y: r[p.key] })),
                      },
                    ],
                  }}
                />
              </div>
            ))}
        </SimpleGrid>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MachineRunningHours — setingan shift + threshold, lalu grafik batang
// Run vs Stop per hari ATAU per shift, untuk rentang tanggal terpilih.
// ═══════════════════════════════════════════════════════════════════
function MachineRunningHours({ cfg, machineKey, flowCol, setFlowCol, threshold, setThreshold }) {
  const toast = useToast();

  // ── Setingan jam shift (load dari backend, bisa diedit & disimpan) ──
  const [shift, setShift] = useState({
    shift1_start: "06:00", shift1_end: "14:00",
    shift2_start: "14:00", shift2_end: "22:00",
    shift3_start: "22:00", shift3_end: "06:00",
  });
  const [savingShift, setSavingShift] = useState(false);

  useEffect(() => {
    apiGet("/getMachineShiftConfig")
      .then((res) => setShift((prev) => ({ ...prev, ...res })))
      .catch(() => {}); // belum ada setingan tersimpan -> pakai default
  }, []);

  const saveShift = () => {
    setSavingShift(true);
    apiPost("/updateMachineShiftConfig", shift)
      .then(() => toast({ title: "Setingan shift disimpan", status: "success", duration: 2000 }))
      .catch((err) => toast({ title: "Gagal menyimpan setingan shift", description: err.message, status: "error" }))
      .finally(() => setSavingShift(false));
  };

  // ── Rentang tanggal & mode tampilan ──────────────────────────────
  const [start, setStart] = useState(daysAgoStr(6));
  const [finish, setFinish] = useState(todayStr());
  const [mode, setMode] = useState("daily"); // "daily" | "shift"
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchRunningHours = useCallback(() => {
    setLoading(true);
    apiGet("/getMachineRunningHours", {
      machine: machineKey,
      start: `${start} 00:00:00`,
      finish: `${finish} 23:59:59`,
      flowCol,
      threshold,
      shift1Start: shift.shift1_start, shift1End: shift.shift1_end,
      shift2Start: shift.shift2_start, shift2End: shift.shift2_end,
      shift3Start: shift.shift3_start, shift3End: shift.shift3_end,
    })
      .then(setResult)
      .catch((err) => toast({ title: "Gagal memuat running hours", description: err.message, status: "error" }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineKey, start, finish, flowCol, threshold, shift]);

  useEffect(() => {
    fetchRunningHours();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineKey]);

  const dailyChartOptions = useMemo(() => ({
    animationEnabled: true,
    theme: "light2",
    title: { text: "Run vs Stop per Hari", fontSize: 14 },
    axisX: { valueFormatString: "DD MMM" },
    axisY: { title: "Jam", suffix: " h" },
    toolTip: { shared: true },
    legend: { cursor: "pointer" },
    data: [
      {
        type: "column", name: "Run", showInLegend: true, color: RUN_COLOR, xValueType: "dateTime",
        dataPoints: (result?.daily || []).map((r) => ({ x: new Date(r.date), y: r.runHours })),
      },
      {
        type: "column", name: "Stop", showInLegend: true, color: STOP_COLOR, xValueType: "dateTime",
        dataPoints: (result?.daily || []).map((r) => ({ x: new Date(r.date), y: r.stopHours })),
      },
    ],
  }), [result]);

  const shiftChartOptions = useMemo(() => ({
    animationEnabled: true,
    theme: "light2",
    title: { text: "Run vs Stop per Shift (total rentang tanggal terpilih)", fontSize: 14 },
    axisX: { interval: 1 },
    axisY: { title: "Jam", suffix: " h" },
    toolTip: { shared: true },
    legend: { cursor: "pointer" },
    data: [
      {
        type: "column", name: "Run", showInLegend: true, color: RUN_COLOR,
        dataPoints: (result?.shiftSummary || []).map((r) => ({ label: `Shift ${r.shift}`, y: r.runHours })),
      },
      {
        type: "column", name: "Stop", showInLegend: true, color: STOP_COLOR,
        dataPoints: (result?.shiftSummary || []).map((r) => ({ label: `Shift ${r.shift}`, y: r.stopHours })),
      },
    ],
  }), [result]);

  const totalRun = (result?.daily || []).reduce((s, r) => s + r.runHours, 0);
  const totalStop = (result?.daily || []).reduce((s, r) => s + r.stopHours, 0);
  const uptimePct = totalRun + totalStop > 0 ? ((totalRun / (totalRun + totalStop)) * 100).toFixed(1) : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Setingan deteksi RUNNING + shift */}
      <div className="bg-card rounded-md shadow-lg p-4 flex flex-col gap-4">
        <Text fontWeight="bold">Pengaturan Deteksi Running</Text>
        <div className="flex gap-4 flex-wrap items-end">
          <FormControl w="220px">
            <FormLabel fontSize="sm">Parameter acuan</FormLabel>
            <Select size="sm" value={flowCol} onChange={(e) => setFlowCol(Number(e.target.value))}>
              {cfg.params.map((p) => (
                <option key={p.col} value={p.col}>{p.label} ({p.unit})</option>
              ))}
            </Select>
          </FormControl>
          <FormControl w="160px">
            <FormLabel fontSize="sm">Threshold (RUNNING jika &gt;)</FormLabel>
            <NumberInput size="sm" value={threshold} onChange={(_, v) => setThreshold(Number.isFinite(v) ? v : 0)}>
              <NumberInputField />
            </NumberInput>
          </FormControl>
        </div>

        <Divider />

        <Text fontWeight="bold">Setingan Jam Shift</Text>
        <div className="flex gap-4 flex-wrap items-end">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-end gap-2">
              <FormControl w="130px">
                <FormLabel fontSize="sm">Shift {n} mulai</FormLabel>
                <Input
                  size="sm"
                  type="time"
                  value={shift[`shift${n}_start`]}
                  onChange={(e) => setShift((s) => ({ ...s, [`shift${n}_start`]: e.target.value }))}
                />
              </FormControl>
              <FormControl w="130px">
                <FormLabel fontSize="sm">Shift {n} selesai</FormLabel>
                <Input
                  size="sm"
                  type="time"
                  value={shift[`shift${n}_end`]}
                  onChange={(e) => setShift((s) => ({ ...s, [`shift${n}_end`]: e.target.value }))}
                />
              </FormControl>
            </div>
          ))}
          <Button size="sm" colorScheme="blue" onClick={saveShift} isLoading={savingShift}>
            Simpan Shift
          </Button>
        </div>
      </div>

      {/* Rentang tanggal + mode tampilan */}
      <div className="flex items-end gap-3 flex-wrap">
        <FormControl w="160px">
          <FormLabel fontSize="sm">Tanggal Mulai</FormLabel>
          <Input size="sm" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormControl>
        <FormControl w="160px">
          <FormLabel fontSize="sm">Tanggal Selesai</FormLabel>
          <Input size="sm" type="date" value={finish} onChange={(e) => setFinish(e.target.value)} />
        </FormControl>
        <RadioGroup value={mode} onChange={setMode}>
          <Stack direction="row" spacing={4}>
            <Radio value="daily">Per Hari</Radio>
            <Radio value="shift">Per Shift</Radio>
          </Stack>
        </RadioGroup>
        <Button size="sm" colorScheme="blue" onClick={fetchRunningHours} isLoading={loading}>Tampilkan</Button>
      </div>

      {/* Ringkasan */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
        <div className="bg-card rounded-md shadow-lg p-4">
          <Stat><StatLabel>Total Run</StatLabel><StatNumber>{totalRun.toFixed(1)} h</StatNumber></Stat>
        </div>
        <div className="bg-card rounded-md shadow-lg p-4">
          <Stat><StatLabel>Total Stop</StatLabel><StatNumber>{totalStop.toFixed(1)} h</StatNumber></Stat>
        </div>
        <div className="bg-card rounded-md shadow-lg p-4">
          <Stat><StatLabel>Uptime</StatLabel><StatNumber>{uptimePct}%</StatNumber></Stat>
        </div>
        <div className="bg-card rounded-md shadow-lg p-4">
          <Stat><StatLabel>Hari Terhitung</StatLabel><StatNumber>{result?.daily?.length ?? 0}</StatNumber></Stat>
        </div>
      </SimpleGrid>

      {/* Grafik batang Run vs Stop */}
      {loading ? (
        <div className="flex justify-center p-8"><Spinner /></div>
      ) : (
        <div className="bg-card rounded-md shadow-lg p-2">
          <CanvasJSChart options={mode === "daily" ? dailyChartOptions : shiftChartOptions} />
        </div>
      )}

      {/* Detail per hari per shift - cuma muncul di mode "Per Shift" */}
      {mode === "shift" && result?.shiftDaily?.length > 0 && (
        <div className="bg-card rounded-md shadow-lg p-4 overflow-x-auto">
          <Text fontWeight="bold" mb={2}>Detail Per Hari Per Shift</Text>
          <Table size="sm">
            <Thead>
              <Tr><Th>Tanggal</Th><Th>Shift</Th><Th isNumeric>Run (h)</Th><Th isNumeric>Stop (h)</Th></Tr>
            </Thead>
            <Tbody>
              {result.shiftDaily.map((r) => (
                <Tr key={`${r.date}-${r.shift}`}>
                  <Td>{r.date}</Td>
                  <Td>Shift {r.shift}</Td>
                  <Td isNumeric>{r.runHours}</Td>
                  <Td isNumeric>{r.stopHours}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
