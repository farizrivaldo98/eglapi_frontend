import { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import {
  Select,
  Input,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableCaption,
  TableContainer,
  Stack,
  Spinner,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Checkbox,
  CheckboxGroup,
  Wrap,
  WrapItem,
  Box,
  Text,
  Badge,
} from "@chakra-ui/react";
import CanvasJSReact from "../canvasjs.react";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useColorMode, useColorModeValue } from "@chakra-ui/react";
import { logAuditAction } from "../features/part/userSlice";
import logo from "../assets/logolapi.png";
var CanvasJS = CanvasJSReact.CanvasJS;
var CanvasJSChart = CanvasJSReact.CanvasJSChart;

// ────────────────────────────────────────────────────────────
// KONFIGURASI CHILLER & WEBSOCKET
// ────────────────────────────────────────────────────────────
const API_BASE = "http://10.163.0.66:8002/part";
const DEFAULT_WS_URL = "ws://10.163.0.66:1880/ws/scada";
const STATUS_COLOR = { live: "green", connecting: "orange", down: "red" };

const CHANNELS = [
  { key: "CH1", label: "Chiller 1", table: "cMT-C21B_CH1_data", color: { light: "#1e6fd9", dark: "#60a5fa" } },
  { key: "CH2", label: "Chiller 2", table: "cMT-C21B_CH2_data", color: { light: "#e8590c", dark: "#fb923c" } },
  { key: "CH3", label: "Chiller 3", table: "cMT-C21B_CH3_data", color: { light: "#0f9960", dark: "#34d399" } },
  { key: "CH4", label: "Chiller 4", table: "cMT-C21B_CH4_data", color: { light: "#c2255c", dark: "#fb7185" } },
];

// urutan & key HARUS selaras sama urutan data_format_0..6 di tabel backend
const METRICS = [
  { key: "capacity", label: "Capacity", unit: "%" },
  { key: "current", label: "Current", unit: "A" },
  { key: "kwInput", label: "KW Input", unit: "kW" },
  { key: "kwOutput", label: "KW Output", unit: "kW" },
  { key: "cop", label: "COP", unit: "" },
  { key: "deltaT", label: "Delta T", unit: "°C" },
  { key: "kwTr", label: "KW/TR", unit: "kW/TR" },
];


// Grouping metrik untuk chart analisa per-chiller (biar sumbu Y gak numpuk)
const PERFORMANCE_METRICS = METRICS.filter((m) => ["capacity", "current", "kwInput", "kwOutput"].includes(m.key));
const EFFICIENCY_METRICS = METRICS.filter((m) => ["cop", "deltaT", "kwTr"].includes(m.key));
const ANALYSIS_REFRESH_MS = 5 * 60 * 1000; // auto refresh data analisa tiap 5 menit
const ANALYSIS_HOUR_OPTIONS = [1, 2, 3, 5, 6, 8, 12, 16, 20, 24]; // pilihan rentang waktu, maksimal 24 jam
const DEFAULT_ANALYSIS_HOURS = 5;

// Ambang batas contoh untuk panel Alerts & Insights - silakan disesuaikan ke standar pabrik
const ANALYSIS_THRESHOLDS = {
  copMin: 3.0, // COP rata-rata di bawah ini dianggap kurang efisien
  deltaTMin: 1.5, // Delta T rata-rata di bawah ini indikasi flow/fouling issue
  kwTrMax: 1.3, // KW/TR rata-rata di atas ini indikasi boros energi
};

const formatDateForApi = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// Parse "YYYY-MM-DD HH:mm:ss" dari DB jadi Date object buat sumbu waktu di chart
const parseDbDate = (dateStr) => {
  if (!dateStr) return null;
  return new Date(String(dateStr).replace(" ", "T"));
};

// Kartu kecil untuk ringkasan KPI di atas panel analisa realtime
const KpiCard = ({ label, value }) => (
  <div className="bg-card rounded-md shadow-lg py-4 px-3 flex flex-col items-center justify-center">
    <span className="text-text text-xs opacity-70 mb-1 text-center">{label}</span>
    <span className="text-text text-xl font-bold">{value}</span>
  </div>
);

function Chiller() {
  // ── STATE ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0); // 0 = Realtime, 1 = Historical

  // State WebSocket untuk Realtime
  const [wsData, setWsData] = useState({});
  const [wsStatus, setWsStatus] = useState("down");
  const wsRef = useRef(null);

  // State untuk Historical
  const [selectedChannels, setSelectedChannels] = useState(["CH1"]);
  const [selectedMetrics, setSelectedMetrics] = useState(METRICS.map((m) => m.key));
  const [channelData, setChannelData] = useState({}); 
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPageByChannel, setCurrentPageByChannel] = useState({});
  const [isTableVisible, setIsTableVisible] = useState(true);

  // State untuk Realtime Analysis (fetch N jam terakhir dari database, semua chiller)
  const [analysisHours, setAnalysisHours] = useState(DEFAULT_ANALYSIS_HOURS);
  const [realtimeAnalysisData, setRealtimeAnalysisData] = useState({});
  const [realtimeAnalysisLoading, setRealtimeAnalysisLoading] = useState(false);
  const [realtimeAnalysisError, setRealtimeAnalysisError] = useState(null);
  const [realtimeAnalysisUpdatedAt, setRealtimeAnalysisUpdatedAt] = useState(null);

  const userGlobal = useSelector((state) => state.user.user);

  const { colorMode } = useColorMode();
  const borderColor = useColorModeValue("rgba(var(--color-border))", "rgba(var(--color-border))");
  const tulisanColor = useColorModeValue("rgba(var(--color-text))", "rgba(var(--color-text))");
  const hoverBorderColor = useColorModeValue("rgba(var(--color-border2))", "rgba(var(--color-border2))");

  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );

  useEffect(() => {
    const handleThemeChange = () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      setIsDarkMode(currentTheme === "dark");
    };
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // ── WEBSOCKET CONNECTION (Untuk Tab Realtime) ──────────────
  const connectWS = () => {
    setWsStatus("connecting");
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(DEFAULT_WS_URL);
    ws.onopen = () => setWsStatus("live");
    ws.onclose = () => setWsStatus("down");
    ws.onerror = () => setWsStatus("down");
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.data) setWsData((prev) => ({ ...prev, ...payload.data }));
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

  // ── REALTIME ANALYSIS: FETCH N JAM TERAKHIR DARI DATABASE ──
  // Pakai endpoint yang sama persis dengan tab Historical (getAllDataChiller),
  // tapi otomatis untuk ke-4 chiller sekaligus dan auto-refresh berkala.
  // Rentang waktu (analysisHours) bisa diatur user, maksimal 24 jam.
  const getAnalysisRange = (hours) => {
    const safeHours = Math.min(Math.max(Number(hours) || DEFAULT_ANALYSIS_HOURS, 1), 24);
    const now = new Date();
    const past = new Date(now.getTime() - safeHours * 60 * 60 * 1000);
    return { startStr: formatDateForApi(past), finishStr: formatDateForApi(now) };
  };

  const fetchRealtimeAnalysisData = async ({ background = false } = {}) => {
    if (!background) {
      setRealtimeAnalysisLoading(true);
      setRealtimeAnalysisError(null);
    }
    try {
      const { startStr, finishStr } = getAnalysisRange(analysisHours);
      const results = await Promise.all(
        CHANNELS.map(async (channel) => {
          const res = await axios.get(`${API_BASE}/getAllDataChiller`, {
            params: { area: channel.table, start: startStr, finish: finishStr },
          });
          return [channel.key, res.data];
        })
      );
      const newData = {};
      results.forEach(([chKey, rows]) => {
        newData[chKey] = rows;
      });
      setRealtimeAnalysisData(newData);
      setRealtimeAnalysisUpdatedAt(new Date());
    } catch (err) {
      console.error("Error fetching realtime analysis data:", err);
      if (!background) setRealtimeAnalysisError("Gagal mengambil data analisa. Coba lagi.");
    } finally {
      if (!background) setRealtimeAnalysisLoading(false);
    }
  };

  // Refetch (foreground, dengan spinner) tiap kali rentang jam diganti, lalu auto-refresh berkala
  useEffect(() => {
    fetchRealtimeAnalysisData();
    const interval = setInterval(() => {
      fetchRealtimeAnalysisData({ background: true });
    }, ANALYSIS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [analysisHours]);

  // Avg/Max/Min untuk data analisa 5 jam (dipakai bar chart & tabel ringkasan per-chiller)
  const getAnalysisStats = (chKey, metricKey) => {
    const rows = realtimeAnalysisData[chKey] || [];
    const values = rows.map((r) => Number(r[metricKey])).filter((v) => !Number.isNaN(v));
    if (values.length === 0) return { avg: null, max: null, min: null };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { avg, max: Math.max(...values), min: Math.min(...values) };
  };

  // Builder chart tren per-chiller (dipakai untuk grafik Performance & Efficiency masing2 chiller)
  const buildChannelChartOptions = (channel, metricsSubset, subtitle) => {
    const rows = realtimeAnalysisData[channel.key] || [];
    const palette = ["#1e6fd9", "#e8590c", "#0f9960", "#c2255c", "#7048e8", "#f2b705", "#0aa1a1"];
    const axisY = metricsSubset.map((metric, idx) => ({
      title: metric.unit ? `${metric.label} (${metric.unit})` : metric.label,
      titleFontColor: isDarkMode ? "#d6d6d6" : "#474747",
      suffix: metric.unit ? ` ${metric.unit}` : "",
      gridColor: idx === 0 ? (isDarkMode ? "#444" : "#bfbfbf") : "transparent",
      labelFontColor: isDarkMode ? "#d6d6d6" : "#474747",
      lineColor: isDarkMode ? "#d6d6d6" : "#474747",
      tickColor: isDarkMode ? "#d6d6d6" : "#474747",
    }));
    const data = metricsSubset.map((metric, idx) => {
      const color = palette[idx % palette.length];
      return {
        type: "line",
        name: metric.unit ? `${metric.label} (${metric.unit})` : metric.label,
        axisYIndex: idx,
        showInLegend: true,
        color,
        lineColor: color,
        markerColor: color,
        dataPoints: rows.map((row) => ({ x: parseDbDate(row.date), y: Number(row[metric.key]), label: row.date })),
      };
    });
    return {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      height: 320,
      title: { text: channel.label, fontColor: isDarkMode ? "white" : "black", fontSize: 15 },
      subtitles: [{ text: subtitle, fontColor: isDarkMode ? "#a3a3a3" : "#666", fontSize: 11 }],
      axisY,
      axisX: {
        valueFormatString: "HH:mm",
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        labelFontColor: isDarkMode ? "white" : "black",
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      toolTip: { shared: true },
      legend: { fontColor: isDarkMode ? "white" : "black", fontSize: 11 },
      data,
    };
  };

  // ── FETCH DATA HISTORICAL ──────────────────────────────────
  const fetchAllData = async (startStr, finishStr, { background = false, mode = "historical" } = {}) => {
    if (selectedChannels.length === 0) return;

    if (!background) {
      setLoading(true);
      setError(null);
    }

    try {
      const results = await Promise.all(
        selectedChannels.map(async (chKey) => {
          const channel = CHANNELS.find((c) => c.key === chKey);
          const res = await axios.get(`${API_BASE}/getAllDataChiller`, {
            params: { area: channel.table, start: startStr, finish: finishStr },
          });
          return [chKey, res.data];
        })
      );

      const newData = {};
      results.forEach(([chKey, rows]) => {
        newData[chKey] = rows;
      });
      setChannelData(newData);
      setCurrentPageByChannel((prev) => {
        const next = { ...prev };
        selectedChannels.forEach((chKey) => {
          if (!next[chKey]) next[chKey] = 1;
        });
        return next;
      });

      if (!background) {
        await logAuditAction("VIEW_CHILLER", {
          mode,
          channels: selectedChannels,
          metrics: selectedMetrics,
          start: startStr,
          finish: finishStr,
        });
      }
    } catch (err) {
      console.error("Error fetching chiller data:", err);
      if (!background) setError("Failed to fetch data. Please try again.");
    } finally {
      if (!background) {
        setTimeout(() => setLoading(false), 2000);
      }
    }
  };

  const getSubmit = () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Isi Start Date dan Finish Date dulu");
      return;
    }
    fetchAllData(datePickerStart.replace("T", " "), datePickerFinish.replace("T", " "), {
      background: false,
      mode: "historical",
    });
  };

  const datePickStart = (e) => setDatePickerStart(e.target.value);
  const datePickFinish = (e) => setDatePickerFinish(e.target.value);

  // ── SELEKSI CHANNEL & METRIC ────────────────────────────────
  const toggleChannels = (values) => {
    if (values.length === 0) return;
    setSelectedChannels(values);
  };

  const toggleMetrics = (values) => {
    if (values.length === 0) return;
    setSelectedMetrics(values);
  };

  // ── PAGINATION PER CHANNEL ─────────────────────────────────
  const handlePrevPage = (chKey) => {
    setCurrentPageByChannel((prev) => ({ ...prev, [chKey]: Math.max((prev[chKey] || 1) - 1, 1) }));
  };
  const handleNextPage = (chKey, totalPages) => {
    setCurrentPageByChannel((prev) => ({
      ...prev,
      [chKey]: Math.min((prev[chKey] || 1) + 1, totalPages),
    }));
  };

  // ── STATS (Avg/Max/Min) ────────────────────────────────────
  const getStats = (chKey, metricKey) => {
    const rows = channelData[chKey] || [];
    const values = rows.map((r) => Number(r[metricKey])).filter((v) => !Number.isNaN(v));
    if (values.length === 0) return { avg: "-", max: "-", min: "-" };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { avg: avg.toFixed(2), max: Math.max(...values).toFixed(2), min: Math.min(...values).toFixed(2) };
  };

  // ── CHART HISTORICAL ─────────────────────────────────────────
  const activeMetrics = METRICS.filter((m) => selectedMetrics.includes(m.key));
  const activeChannels = CHANNELS.filter((c) => selectedChannels.includes(c.key));

  const axisY = activeMetrics.map((metric) => ({
    title: metric.unit ? `${metric.label} (${metric.unit})` : metric.label,
    titleFontColor: isDarkMode ? "#d6d6d6" : "#474747",
    suffix: metric.unit ? ` ${metric.unit}` : "",
    gridColor: isDarkMode ? "#444" : "#bfbfbf",
    labelFontColor: isDarkMode ? "#d6d6d6" : "#474747",
    lineColor: isDarkMode ? "#d6d6d6" : "#474747",
    tickColor: isDarkMode ? "#d6d6d6" : "#474747",
    tickLength: 5,
    tickThickness: 2,
  }));

  const chartSeries = [];
  activeChannels.forEach((channel) => {
    const rows = channelData[channel.key] || [];
    activeMetrics.forEach((metric, metricIndex) => {
      const color = isDarkMode ? channel.color.dark : channel.color.light;
      chartSeries.push({
        type: "line",
        name: `${channel.label} - ${metric.label}`,
        axisYIndex: metricIndex,
        showInLegend: true,
        xValueFormatString: "HH:mm",
        yValueFormatString: "HH:mm",
        color,
        lineColor: color,
        markerColor: color,
        dataPoints: rows.map((row) => ({
          x: row.id,
          y: Number(row[metric.key]),
          label: row.date,
        })),
      });
    });
  });

  const chartOptions = {
    zoomEnabled: true,
    theme: isDarkMode ? "dark2" : "light2",
    backgroundColor: isDarkMode ? "#171717" : "#ffffff",
    height: 500,
    title: {
      text: "Chiller Performance",
      fontColor: isDarkMode ? "white" : "black",
    },
    subtitles: [{ text: "Historical", fontColor: isDarkMode ? "white" : "black" }],
    axisY,
    axisX: {
      lineColor: isDarkMode ? "#d6d6d6" : "#474747",
      labelFontColor: isDarkMode ? "white" : "black",
      tickLength: 5,
      tickThickness: 2,
      tickColor: isDarkMode ? "#d6d6d6" : "#474747",
    },
    toolTip: { shared: true },
    data: chartSeries,
  };

  // ── EXPORT PDF ─────────────────────────────────────────────
  const exportToPDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const totalPagesExp = "{p}";

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const formattedDateTime = `${day}/${month}/${year} ${hours}:${minutes}`;
    const fileSuffix = `${year}${month}${day}_${hours}${minutes}`;

    const drawHeader = () => {
      doc.addImage(logo, "JPEG", 10, 8, 25, 12);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("PT LAPI LABORATORIES", pageWidth / 2, 13, { align: "center" });
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(
        "Jl. Kawasan Industri Modern Kav. 18, Industrial Estate, Cikande, Nambo Ilir, Serang, Kabupaten Serang, Banten 42186",
        pageWidth / 2,
        19.5,
        { align: "center" }
      );
      doc.text(
        "Phone: (0254) 402150, Fax (0254)402151, Homepage: www.lapilaboratories.com",
        pageWidth / 2,
        22,
        { align: "center" }
      );
      doc.line(10, 27, pageWidth - 10, 27);
    };

    const drawWatermarkAndFooter = () => {
      const pageHeight = doc.internal.pageSize.height;
      doc.setGState(new doc.GState({ opacity: 0.15 }));
      doc.addImage({ imageData: logo, format: "JPEG", x: 70, y: 150, w: 160, h: 80, angle: 45 });
      doc.setGState(new doc.GState({ opacity: 1.0 }));
      drawHeader();
      doc.setFontSize(9);
      doc.text(`Generated by Chiller Monitoring - ${formattedDateTime}`, 14, pageHeight - 10);
      doc.text(
        `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${totalPagesExp}`,
        pageWidth - 14,
        pageHeight - 10,
        { align: "right" }
      );
    };

    activeChannels.forEach((channel, index) => {
      if (index > 0) doc.addPage();

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(channel.label, 14, 32);

      const columns = [
        { header: "ID", dataKey: "id" },
        { header: "Date", dataKey: "date" },
        ...activeMetrics.map((m) => ({ header: m.unit ? `${m.label} (${m.unit})` : m.label, dataKey: m.key })),
      ];

      autoTable(doc, {
        columns,
        body: channelData[channel.key] || [],
        startY: 35,
        margin: { top: 35, bottom: 20 },
        didDrawPage: drawWatermarkAndFooter,
      });
    });

    if (typeof doc.putTotalPages === "function") {
      doc.putTotalPages(totalPagesExp);
    }

    doc.save(`chiller-historical-${fileSuffix}.pdf`);
  };

  // ── RENDER COMPONENT: REALTIME TABLE (Menggunakan Node-RED WebSocket) ──
  const renderRealtimeTable = () => {
    const tdStyles = { borderWidth: "2px", borderColor: borderColor, textAlign: "center", transition: "0.2s ease" };
    return (
      <div className="mx-4 md:mx-20 mb-4 bg-card rounded-md shadow-lg p-2 mt-4">
        <div className="p-4 flex gap-4 items-center mb-2">
          <Button onClick={connectWS} size="sm" colorScheme="blue">Reconnect WS</Button>
          <Badge colorScheme={STATUS_COLOR[wsStatus]}>STATUS: {wsStatus.toUpperCase()}</Badge>
        </div>
        <TableContainer>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th sx={tdStyles}>Chiller</Th>
                <Th sx={tdStyles}>Status</Th>
                <Th sx={tdStyles}>Capacity (%)</Th>
                <Th sx={tdStyles}>Current (A)</Th>
                <Th sx={tdStyles}>Temp IN (°C)</Th>
                <Th sx={tdStyles}>Temp OUT (°C)</Th>
                <Th sx={tdStyles}>COP</Th>
                <Th sx={tdStyles}>Delta T (°C)</Th>
                <Th sx={tdStyles}>KW/TR</Th>
              </Tr>
            </Thead>
            <Tbody>
       
{CHANNELS.map((ch) => {
  const prefix = ch.key; // "CH1", "CH2", "CH3", "CH4"
  

  const status = wsData[`${prefix}_Status`];
  const capacity = wsData[`${prefix}_Capacity`];
  const current = wsData[`${prefix}_Current`];
  const tempIn = wsData[`${prefix}_Temp_IN`];
  const tempOut = wsData[`${prefix}_Temp_OUT`];
  const cop = wsData[`${prefix}_COP`];
  const deltaT = wsData[`${prefix}_DeltaT`];
  const kwtr = wsData[`${prefix}_KWTR`];

  return (
    <Tr key={ch.key}>
      <Td sx={{...tdStyles, textAlign: "left", fontWeight: "bold"}}>{ch.label}</Td>
      <Td sx={tdStyles}>
        {capacity > 0 ? (
          <Badge colorScheme="green">RUNNING</Badge>
        ) : capacity === 0 ? (
          <Badge colorScheme="red">STOPPED</Badge>
        ) : (
          '-'
        )}
      </Td>
      <Td sx={tdStyles}>{capacity !== undefined && capacity !== null ? capacity.toFixed(1) : '-'}</Td>
      <Td sx={tdStyles}>{current !== undefined && current !== null ? current.toFixed(1) : '-'}</Td>
      <Td sx={tdStyles}>{tempIn !== undefined && tempIn !== null ? tempIn.toFixed(1) : '-'}</Td>
      <Td sx={tdStyles}>{tempOut !== undefined && tempOut !== null ? tempOut.toFixed(1) : '-'}</Td>
      <Td sx={tdStyles}>{cop !== undefined && cop !== null ? cop.toFixed(2) : '-'}</Td>
      <Td sx={tdStyles}>{deltaT !== undefined && deltaT !== null ? deltaT.toFixed(1) : '-'}</Td>
      <Td sx={tdStyles}>{kwtr !== undefined && kwtr !== null ? kwtr.toFixed(2) : '-'}</Td>
    </Tr>
  );
})}
            </Tbody>
          </Table>
        </TableContainer>
      </div>
    );
  };

  // ── RENDER COMPONENT: DETAIL CHART + STATS PER CHILLER (ANALYSIS) ──
  const renderChannelAnalysisBlock = (channel) => {
    const rows = realtimeAnalysisData[channel.key] || [];
    const perfOptions = buildChannelChartOptions(channel, PERFORMANCE_METRICS, `Performance - ${analysisHours} jam terakhir`);
    const effOptions = buildChannelChartOptions(channel, EFFICIENCY_METRICS, `Efficiency - ${analysisHours} jam terakhir`);

    return (
      <div key={channel.key} className="mt-4 bg-card rounded-md shadow-lg p-2">
        <div className="flex items-center gap-2 pt-2 px-2 mb-1">
          <Box
            as="span"
            display="inline-block"
            w="10px"
            h="10px"
            borderRadius="full"
            bg={isDarkMode ? channel.color.dark : channel.color.light}
          />
          <Text className="text-text" fontWeight="bold">
            {channel.label}
          </Text>
          <Text fontSize="xs" opacity={0.6} className="text-text">
            ({rows.length} data poin / {analysisHours}h)
          </Text>
        </div>

        {rows.length === 0 ? (
          <div className="text-text flex flex-col items-center py-10">No data in the selected window</div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 px-1 pb-2">
              <CanvasJSChart options={perfOptions} />
              <CanvasJSChart options={effOptions} />
            </div>
            <TableContainer mt={1} mb={2}>
              <Table key={`analysis-stats-${channel.key}-${colorMode}`} size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th sx={{ color: tulisanColor }}>Metric</Th>
                    <Th sx={{ color: tulisanColor }}>Avg</Th>
                    <Th sx={{ color: tulisanColor }}>Max</Th>
                    <Th sx={{ color: tulisanColor }}>Min</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {METRICS.map((metric) => {
                    const stats = getAnalysisStats(channel.key, metric.key);
                    return (
                      <Tr key={metric.key}>
                        <Td>
                          {metric.label}
                          {metric.unit ? ` (${metric.unit})` : ""}
                        </Td>
                        <Td>{stats.avg !== null ? stats.avg.toFixed(2) : "-"}</Td>
                        <Td>{stats.max !== null ? stats.max.toFixed(2) : "-"}</Td>
                        <Td>{stats.min !== null ? stats.min.toFixed(2) : "-"}</Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </>
        )}
      </div>
    );
  };

  // ── RENDER COMPONENT: PANEL ANALISA REALTIME (di bawah tabel status) ──
  const renderRealtimeAnalysis = () => {
    // Kontribusi load live (%) tiap chiller, dari data websocket
    const capacityPieData = CHANNELS.map((ch) => ({
      label: ch.label,
      value: Number(wsData[`${ch.key}_Capacity`]) || 0,
      color: isDarkMode ? ch.color.dark : ch.color.light,
    }));
    const totalLiveCapacity = capacityPieData.reduce((sum, d) => sum + d.value, 0);

    const statusCounts = CHANNELS.reduce(
      (acc, ch) => {
        const cap = wsData[`${ch.key}_Capacity`];
        if (cap > 0) acc.running += 1;
        else if (cap === 0) acc.stopped += 1;
        else acc.unknown += 1;
        return acc;
      },
      { running: 0, stopped: 0, unknown: 0 }
    );

    const liveCapacities = CHANNELS.map((ch) => wsData[`${ch.key}_Capacity`]).filter(
      (v) => v !== undefined && v !== null
    );
    const avgCapacityLive = liveCapacities.length
      ? liveCapacities.reduce((a, b) => a + b, 0) / liveCapacities.length
      : null;
    const runningCOPs = CHANNELS.map((ch) => wsData[`${ch.key}_COP`]).filter(
      (v) => v !== undefined && v !== null && v > 0
    );
    const avgCOPLive = runningCOPs.length ? runningCOPs.reduce((a, b) => a + b, 0) / runningCOPs.length : null;
    const runningKwTr = CHANNELS.map((ch) => wsData[`${ch.key}_KWTR`]).filter(
      (v) => v !== undefined && v !== null && v > 0
    );
    const avgKwTrLive = runningKwTr.length ? runningKwTr.reduce((a, b) => a + b, 0) / runningKwTr.length : null;
    const activeChillerCount = CHANNELS.filter((ch) => wsData[`${ch.key}_Capacity`] > 0).length;

    // ── IMPROVISASI: total rata-rata beban sistem (kW) dari data N jam terakhir
    const channelsWithKwInput = CHANNELS.map((ch) => getAnalysisStats(ch.key, "kwInput")).filter(
      (s) => s.avg !== null
    );
    const totalAvgSystemLoad = channelsWithKwInput.reduce((sum, s) => sum + s.avg, 0);

    // ── IMPROVISASI: uptime % tiap chiller selama window yang dipilih (dari data DB, bukan WS)
    const uptimeData = CHANNELS.map((ch) => {
      const rows = realtimeAnalysisData[ch.key] || [];
      const runningCount = rows.filter((r) => Number(r.capacity) > 0).length;
      const uptimePct = rows.length > 0 ? Number(((runningCount / rows.length) * 100).toFixed(1)) : null;
      return { label: ch.label, uptimePct, color: isDarkMode ? ch.color.dark : ch.color.light };
    });

    // ── IMPROVISASI: ranking efisiensi (Avg COP) tiap chiller yang punya data
    const efficiencyRanking = CHANNELS.map((ch) => ({
      label: ch.label,
      avgCop: getAnalysisStats(ch.key, "cop").avg,
    }))
      .filter((r) => r.avgCop !== null)
      .sort((a, b) => b.avgCop - a.avgCop);

    // ── IMPROVISASI: alert sederhana berbasis ambang batas (ANALYSIS_THRESHOLDS)
    const alerts = [];
    CHANNELS.forEach((ch) => {
      const rows = realtimeAnalysisData[ch.key] || [];
      if (rows.length === 0) return;
      const copStats = getAnalysisStats(ch.key, "cop");
      const dtStats = getAnalysisStats(ch.key, "deltaT");
      const kwTrStats = getAnalysisStats(ch.key, "kwTr");
      if (copStats.avg !== null && copStats.avg < ANALYSIS_THRESHOLDS.copMin) {
        alerts.push({
          channel: ch.label,
          title: "COP Rendah",
          detail: `Avg COP ${copStats.avg.toFixed(2)} (target > ${ANALYSIS_THRESHOLDS.copMin})`,
        });
      }
      if (dtStats.avg !== null && dtStats.avg < ANALYSIS_THRESHOLDS.deltaTMin) {
        alerts.push({
          channel: ch.label,
          title: "Delta T Rendah",
          detail: `Avg Delta T ${dtStats.avg.toFixed(2)}°C (target > ${ANALYSIS_THRESHOLDS.deltaTMin}°C) - cek flow/fouling`,
        });
      }
      if (kwTrStats.avg !== null && kwTrStats.avg > ANALYSIS_THRESHOLDS.kwTrMax) {
        alerts.push({
          channel: ch.label,
          title: "KW/TR Tinggi",
          detail: `Avg KW/TR ${kwTrStats.avg.toFixed(2)} (target < ${ANALYSIS_THRESHOLDS.kwTrMax}) - efisiensi menurun`,
        });
      }
    });

    const capacityPieOptions = {
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      height: 300,
      title: { text: "Load Contribution (%)", fontColor: isDarkMode ? "white" : "black", fontSize: 15 },
      subtitles: [{ text: "Live, berdasarkan capacity", fontColor: isDarkMode ? "#a3a3a3" : "#666", fontSize: 11 }],
      data: [
        {
          type: "pie",
          startAngle: -90,
          indexLabel: "{label}: {y}%",
          indexLabelFontColor: isDarkMode ? "#d6d6d6" : "#333",
          toolTipContent: "{label}: {y}% dari total load",
          dataPoints: capacityPieData.map((d) => ({
            y: totalLiveCapacity > 0 ? Number(((d.value / totalLiveCapacity) * 100).toFixed(1)) : 0,
            label: d.label,
            color: d.color,
          })),
        },
      ],
    };

    const statusPieOptions = {
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      height: 300,
      title: { text: "Chiller Status", fontColor: isDarkMode ? "white" : "black", fontSize: 15 },
      subtitles: [{ text: "Live snapshot", fontColor: isDarkMode ? "#a3a3a3" : "#666", fontSize: 11 }],
      data: [
        {
          type: "doughnut",
          indexLabel: "{label}: {y}",
          indexLabelFontColor: isDarkMode ? "#d6d6d6" : "#333",
          dataPoints: [
            { y: statusCounts.running, label: "Running", color: "#0f9960" },
            { y: statusCounts.stopped, label: "Stopped", color: "#e03131" },
            ...(statusCounts.unknown > 0 ? [{ y: statusCounts.unknown, label: "Unknown", color: "#adb5bd" }] : []),
          ],
        },
      ],
    };

    const copBarOptions = {
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      height: 300,
      title: { text: `Avg COP (${analysisHours}h)`, fontColor: isDarkMode ? "white" : "black", fontSize: 15 },
      subtitles: [{ text: "Semakin tinggi semakin baik", fontColor: isDarkMode ? "#a3a3a3" : "#666", fontSize: 11 }],
      axisY: {
        title: "COP",
        titleFontColor: isDarkMode ? "#d6d6d6" : "#474747",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      axisX: { labelFontColor: isDarkMode ? "white" : "black" },
      data: [
        {
          type: "column",
          indexLabel: "{y}",
          indexLabelFontColor: isDarkMode ? "#d6d6d6" : "#333",
          dataPoints: CHANNELS.map((ch) => {
            const stats = getAnalysisStats(ch.key, "cop");
            return {
              label: ch.label,
              y: stats.avg !== null ? Number(stats.avg.toFixed(2)) : 0,
              color: isDarkMode ? ch.color.dark : ch.color.light,
            };
          }),
        },
      ],
    };

    const kwTrBarOptions = {
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      height: 300,
      title: { text: `Avg KW/TR (${analysisHours}h)`, fontColor: isDarkMode ? "white" : "black", fontSize: 15 },
      subtitles: [{ text: "Semakin rendah semakin efisien", fontColor: isDarkMode ? "#a3a3a3" : "#666", fontSize: 11 }],
      axisY: {
        title: "KW/TR",
        titleFontColor: isDarkMode ? "#d6d6d6" : "#474747",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      axisX: { labelFontColor: isDarkMode ? "white" : "black" },
      data: [
        {
          type: "column",
          indexLabel: "{y}",
          indexLabelFontColor: isDarkMode ? "#d6d6d6" : "#333",
          dataPoints: CHANNELS.map((ch) => {
            const stats = getAnalysisStats(ch.key, "kwTr");
            return {
              label: ch.label,
              y: stats.avg !== null ? Number(stats.avg.toFixed(2)) : 0,
              color: isDarkMode ? ch.color.dark : ch.color.light,
            };
          }),
        },
      ],
    };

    const uptimeBarOptions = {
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      height: 300,
      title: { text: `Uptime (${analysisHours}h)`, fontColor: isDarkMode ? "white" : "black", fontSize: 15 },
      subtitles: [{ text: "% waktu Capacity > 0", fontColor: isDarkMode ? "#a3a3a3" : "#666", fontSize: 11 }],
      axisY: {
        title: "Uptime (%)",
        titleFontColor: isDarkMode ? "#d6d6d6" : "#474747",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "#d6d6d6" : "#474747",
        maximum: 100,
      },
      axisX: { labelFontColor: isDarkMode ? "white" : "black" },
      data: [
        {
          type: "column",
          indexLabel: "{y}%",
          indexLabelFontColor: isDarkMode ? "#d6d6d6" : "#333",
          dataPoints: uptimeData.map((d) => ({ label: d.label, y: d.uptimePct || 0, color: d.color })),
        },
      ],
    };

    const systemLoadChartOptions = {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      height: 380,
      title: { text: "System Power Draw Trend (KW Input)", fontColor: isDarkMode ? "white" : "black", fontSize: 16 },
      subtitles: [
        {
          text: `${analysisHours} jam terakhir, semua chiller ditumpuk sejajar`,
          fontColor: isDarkMode ? "#a3a3a3" : "#666",
          fontSize: 11,
        },
      ],
      axisY: {
        title: "KW Input (kW)",
        titleFontColor: isDarkMode ? "#d6d6d6" : "#474747",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      axisX: {
        valueFormatString: "HH:mm",
        labelFontColor: isDarkMode ? "white" : "black",
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      toolTip: { shared: true },
      legend: { fontColor: isDarkMode ? "white" : "black" },
      data: CHANNELS.map((ch) => {
        const rows = realtimeAnalysisData[ch.key] || [];
        const color = isDarkMode ? ch.color.dark : ch.color.light;
        return {
          type: "line",
          name: ch.label,
          showInLegend: true,
          color,
          lineColor: color,
          markerColor: color,
          dataPoints: rows.map((row) => ({ x: parseDbDate(row.date), y: Number(row.kwInput), label: row.date })),
        };
      }),
    };

    const hasAnalysisData = CHANNELS.some((ch) => (realtimeAnalysisData[ch.key] || []).length > 0);

    return (
      <div className="mx-4 md:mx-20 mb-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-8 mb-4">
          <Text className="text-text" fontWeight="bold" fontSize="lg">
            Realtime Analysis (Last {analysisHours}h)
          </Text>
          <div className="flex items-center gap-3 flex-wrap">
            <Select
              size="sm"
              width="130px"
              value={analysisHours}
              onChange={(e) => setAnalysisHours(Number(e.target.value))}
              sx={{
                border: "1px solid",
                borderColor: borderColor,
                background: "var(--color-background)",
              }}
            >
              {ANALYSIS_HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{`Last ${h}h`}</option>
              ))}
            </Select>
            <Text fontSize="xs" className="text-text" opacity={0.7}>
              {realtimeAnalysisUpdatedAt ? `Updated: ${realtimeAnalysisUpdatedAt.toLocaleTimeString()}` : "Belum dimuat"}
            </Text>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={() => fetchRealtimeAnalysisData()}
              isLoading={realtimeAnalysisLoading}
            >
              Refresh Analysis
            </Button>
          </div>
        </div>

        {/* KPI cards - ringkasan cepat */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <KpiCard label="Active Chillers" value={`${activeChillerCount} / ${CHANNELS.length}`} />
          <KpiCard label="Avg Capacity" value={avgCapacityLive !== null ? `${avgCapacityLive.toFixed(1)}%` : "-"} />
          <KpiCard label="Avg COP (Running)" value={avgCOPLive !== null ? avgCOPLive.toFixed(2) : "-"} />
          <KpiCard label="Avg KW/TR (Running)" value={avgKwTrLive !== null ? avgKwTrLive.toFixed(2) : "-"} />
          <KpiCard
            label="Total Avg System Load"
            value={channelsWithKwInput.length ? `${totalAvgSystemLoad.toFixed(1)} kW` : "-"}
          />
        </div>

        {realtimeAnalysisError && <div className="text-red-500 text-center mb-4">{realtimeAnalysisError}</div>}

        {/* Pie / Doughnut: kontribusi load & status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-card rounded-md shadow-lg p-2">
            {totalLiveCapacity > 0 ? (
              <CanvasJSChart options={capacityPieOptions} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-text">
                No active load right now
              </div>
            )}
          </div>
          <div className="bg-card rounded-md shadow-lg p-2">
            <CanvasJSChart options={statusPieOptions} />
          </div>
        </div>

        {/* Data dari database (rentang waktu dipilih user) */}
        {realtimeAnalysisLoading && !hasAnalysisData ? (
          <div className="flex flex-col items-center py-10">
            <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="lg" />
          </div>
        ) : hasAnalysisData ? (
          <>
            {/* Alerts & Insights + Efficiency Ranking */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-card rounded-md shadow-lg p-4">
                <Text className="text-text" fontWeight="bold" mb={3}>
                  Alerts &amp; Insights
                </Text>
                {alerts.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <Badge colorScheme="green">OK</Badge>
                    <Text fontSize="sm" className="text-text">
                      Semua chiller dalam rentang operasi normal.
                    </Text>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {alerts.map((a, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <Badge colorScheme="orange" whiteSpace="nowrap">
                          {a.channel}
                        </Badge>
                        <div>
                          <Text fontSize="sm" fontWeight="bold" className="text-text">
                            {a.title}
                          </Text>
                          <Text fontSize="xs" className="text-text" opacity={0.75}>
                            {a.detail}
                          </Text>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-card rounded-md shadow-lg p-4">
                <Text className="text-text" fontWeight="bold" mb={3}>
                  Efficiency Ranking (Avg COP)
                </Text>
                {efficiencyRanking.length === 0 ? (
                  <Text fontSize="sm" className="text-text" opacity={0.7}>
                    Belum ada data COP di window ini.
                  </Text>
                ) : (
                  <TableContainer>
                    <Table size="sm" variant="simple">
                      <Thead>
                        <Tr>
                          <Th sx={{ color: tulisanColor }}>#</Th>
                          <Th sx={{ color: tulisanColor }}>Chiller</Th>
                          <Th sx={{ color: tulisanColor }}>Avg COP</Th>
                          <Th sx={{ color: tulisanColor }}></Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {efficiencyRanking.map((r, idx) => (
                          <Tr key={r.label}>
                            <Td>{idx + 1}</Td>
                            <Td>{r.label}</Td>
                            <Td>{r.avgCop.toFixed(2)}</Td>
                            <Td>
                              {idx === 0 && <Badge colorScheme="green">Best</Badge>}
                              {idx === efficiencyRanking.length - 1 && efficiencyRanking.length > 1 && (
                                <Badge colorScheme="orange">Lowest</Badge>
                              )}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            </div>

            {/* Efficiency & Uptime bar charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-card rounded-md shadow-lg p-2">
                <CanvasJSChart options={copBarOptions} />
              </div>
              <div className="bg-card rounded-md shadow-lg p-2">
                <CanvasJSChart options={kwTrBarOptions} />
              </div>
              <div className="bg-card rounded-md shadow-lg p-2">
                <CanvasJSChart options={uptimeBarOptions} />
              </div>
            </div>

            <div className="bg-card rounded-md shadow-lg p-2 mb-6">
              <CanvasJSChart options={systemLoadChartOptions} />
            </div>

            <Text className="text-text" fontWeight="bold" fontSize="md" mb={2}>
              Per-Chiller Trend Detail
            </Text>
            {CHANNELS.map((channel) => renderChannelAnalysisBlock(channel))}
          </>
        ) : (
          <div className="text-text text-center py-10 bg-card rounded-md shadow-lg">
            No data found in the database for the selected window.
          </div>
        )}
      </div>
    );
  };

  // ── RENDER COMPONENT: HISTORICAL SELECTOR ────────────────
  const renderChannelSelector = () => (
    <CheckboxGroup value={selectedChannels} onChange={toggleChannels}>
      <Wrap spacing={4}>
        {CHANNELS.map((channel) => (
          <WrapItem key={channel.key}>
            <Checkbox value={channel.key}>
              <Box as="span" display="inline-flex" alignItems="center" gap="6px">
                <Box
                  as="span"
                  display="inline-block"
                  w="10px"
                  h="10px"
                  borderRadius="full"
                  bg={isDarkMode ? channel.color.dark : channel.color.light}
                />
                <Text as="span" className="text-text">
                  {channel.label}
                </Text>
              </Box>
            </Checkbox>
          </WrapItem>
        ))}
      </Wrap>
    </CheckboxGroup>
  );

  const renderMetricSelector = () => (
    <CheckboxGroup value={selectedMetrics} onChange={toggleMetrics}>
      <Wrap spacing={4}>
        {METRICS.map((metric) => (
          <WrapItem key={metric.key}>
            <Checkbox value={metric.key}>
              <Text as="span" className="text-text">
                {metric.label}
                {metric.unit ? ` (${metric.unit})` : ""}
              </Text>
            </Checkbox>
          </WrapItem>
        ))}
      </Wrap>
    </CheckboxGroup>
  );

  // ── RENDER COMPONENT: HISTORICAL STATS ────────────────────
  const renderStatsTable = () => (
    <div className="mt-6 mx-4 md:mx-20 bg-card rounded-md">
      <TableContainer maxHeight="320px" overflowY="auto">
        <Table key={`stats-${colorMode}`} variant="simple" size="sm">
          <TableCaption sx={{ color: tulisanColor }}>Summary</TableCaption>
          <Thead>
            <Tr>
              <Th sx={{ color: tulisanColor }}>Channel</Th>
              <Th sx={{ color: tulisanColor }}>Metric</Th>
              <Th sx={{ color: tulisanColor }}>Avg</Th>
              <Th sx={{ color: tulisanColor }}>Max</Th>
              <Th sx={{ color: tulisanColor }}>Min</Th>
            </Tr>
          </Thead>
          <Tbody>
            {activeChannels.flatMap((channel) =>
              activeMetrics.map((metric) => {
                const stats = getStats(channel.key, metric.key);
                return (
                  <Tr key={`${channel.key}-${metric.key}`}>
                    <Td>{channel.label}</Td>
                    <Td>
                      {metric.label}
                      {metric.unit ? ` (${metric.unit})` : ""}
                    </Td>
                    <Td>{stats.avg}</Td>
                    <Td>{stats.max}</Td>
                    <Td>{stats.min}</Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Table>
      </TableContainer>
    </div>
  );

  // ── RENDER COMPONENT: HISTORICAL RAW DATA TABLE ──────────
  const renderChannelTable = (channel) => {
    const rows = channelData[channel.key] || [];
    const totalPages = Math.max(Math.ceil(rows.length / rowsPerPage), 1);
    const currentPage = Math.min(currentPageByChannel[channel.key] || 1, totalPages);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const visibleRows = rows.slice(startIndex, startIndex + rowsPerPage);

    return (
      <div key={channel.key} className="mt-8 mx-4 md:mx-20 bg-card rounded-md">
        <div className="flex items-center gap-2 pt-3 px-4">
          <Box
            as="span"
            display="inline-block"
            w="10px"
            h="10px"
            borderRadius="full"
            bg={isDarkMode ? channel.color.dark : channel.color.light}
          />
          <Text className="text-text" fontWeight="bold">
            {channel.label}
          </Text>
        </div>
        <TableContainer>
          <Table key={`${channel.key}-${colorMode}`} variant="simple">
            <Thead>
              <Tr>
                <Th sx={{ color: tulisanColor }}>ID</Th>
                <Th sx={{ color: tulisanColor }}>Date Time</Th>
                {activeMetrics.map((metric) => (
                  <Th key={metric.key} sx={{ color: tulisanColor }}>
                    {metric.label}
                    {metric.unit ? ` (${metric.unit})` : ""}
                  </Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {visibleRows.length === 0 ? (
                <Tr>
                  <Td colSpan={2 + activeMetrics.length} textAlign="center" display="table-cell">
                    No data available
                  </Td>
                </Tr>
              ) : (
                visibleRows.map((row) => (
                  <Tr key={row.id}>
                    <Td>{row.id}</Td>
                    <Td>{row.date}</Td>
                    {activeMetrics.map((metric) => (
                      <Td key={metric.key}>{row[metric.key]}</Td>
                    ))}
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </TableContainer>
        <div className="flex justify-center items-center my-4 gap-4">
          <Button
            onClick={() => handlePrevPage(channel.key)}
            isDisabled={currentPage === 1}
            colorScheme="blue"
            size="sm"
          >
            Previous
          </Button>
          <span className="text-text">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            onClick={() => handleNextPage(channel.key, totalPages)}
            isDisabled={currentPage === totalPages}
            colorScheme="blue"
            size="sm"
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  const hasSelection = selectedChannels.length > 0 && selectedMetrics.length > 0;

  // ── RENDER UTAMA ─────────────────────────────────────────────
  return (
    <div>
      <Tabs
        index={activeTab}
        onChange={setActiveTab}
        isFitted
        variant="enclosed"
        colorScheme="blue"
        className="mx-4 md:mx-20 mt-4"
      >
        <TabList>
          <Tab>Realtime</Tab>
          <Tab>Historical</Tab>
        </TabList>
        <TabPanels>
          
          {/* TAB 0 - REALTIME */}
          <TabPanel px={0}>
             {renderRealtimeTable()}
             {renderRealtimeAnalysis()}
          </TabPanel>

          {/* TAB 1 - HISTORICAL */}
          <TabPanel px={0}>
            <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap">
              <div>
                <h5 className="mb-1">Start Date</h5>
                <Input
                  onChange={datePickStart}
                  placeholder="Start Date"
                  size="md"
                  type="datetime-local"
                  css={{
                    "&::-webkit-calendar-picker-indicator": {
                      color: isDarkMode ? "white" : "black",
                      filter: isDarkMode ? "invert(1)" : "none",
                    },
                  }}
                  sx={{
                    border: "1px solid",
                    borderColor: borderColor,
                    borderRadius: "0.395rem",
                    background: "var(--color-background)",
                    _hover: { borderColor: hoverBorderColor },
                  }}
                />
              </div>
              <div>
                <h5 className="mb-1">Finish Date</h5>
                <Input
                  onChange={datePickFinish}
                  placeholder="Finish Date"
                  size="md"
                  type="datetime-local"
                  css={{
                    "&::-webkit-calendar-picker-indicator": {
                      color: isDarkMode ? "white" : "black",
                      filter: isDarkMode ? "invert(1)" : "none",
                    },
                  }}
                  sx={{
                    border: "1px solid",
                    borderColor: borderColor,
                    borderRadius: "0.395rem",
                    background: "var(--color-background)",
                    _hover: { borderColor: hoverBorderColor },
                  }}
                />
              </div>
              <div className="w-full flex justify-center xl:w-auto">
                <div className="ml-0 xl:ml-6 mt-7 truncate">
                  <Button onClick={getSubmit} colorScheme="blue">
                    Submit
                  </Button>
                </div>
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* ELEMENT HISTORICAL (Hanya tampil di Tab 1) */}
      {activeTab === 1 && (
        <>
          <div className="mx-4 md:mx-20 mb-2 mt-2">
            <h5 className="mb-1 text-text">Channel</h5>
            {renderChannelSelector()}
          </div>
          <div className="mx-4 md:mx-20 mb-6 mt-4">
            <h5 className="mb-1 text-text">Metric</h5>
            {renderMetricSelector()}
          </div>

          <div className="w-full flex justify-center mb-4">
            <Button onClick={exportToPDF} colorScheme="red" isDisabled={userGlobal.level < 3}>
              Export to PDF
            </Button>
          </div>

          <div className="block bg-card rounded-lg p-1 shadow-lg mx-4 md:mx-20 overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center py-10">
                <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="xl" />
              </div>
            ) : error ? (
              <div className="text-red-500 flex flex-col items-center py-10">{error}</div>
            ) : !hasSelection ? (
              <div className="text-text flex flex-col items-center py-10">Pilih minimal 1 channel dan 1 metric</div>
            ) : (
              <CanvasJSChart options={chartOptions} />
            )}
          </div>

          {!loading && !error && hasSelection && renderStatsTable()}

          <br />
          <Stack className="flex flex-row justify-center gap-2" direction="row" spacing={2} align="center">
            <div className="mt-2">
              <Select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} width="80px">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={40}>40</option>
                <option value={60}>60</option>
                <option value={100}>100</option>
              </Select>
            </div>
            <div>
              <Button className="w-40 mt-2" colorScheme="red" onClick={() => setIsTableVisible(!isTableVisible)}>
                {isTableVisible ? "Hide All Data" : "Show All Data"}
              </Button>
            </div>
          </Stack>

          {isTableVisible && hasSelection && activeChannels.map((channel) => renderChannelTable(channel))}
        </>
      )}
    </div>
  );
}

export default Chiller;