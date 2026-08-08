import { useState, useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import {
  Select,
  Input,
  Button,
  Checkbox,
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

const PERIOD_LABELS = {
  hourly: "Per Jam",
  daily: "Per Hari",
  monthly: "Per Bulan",
};

// Backend (getEnergyPowerHistorical) SELALU balikin value dalam satuan Wh
// (lihat data_format_4 = Total Energy (Wh) di databaseControllers.js).
// Konversi Wh -> kWh -> MWh murni dilakukan di sini (frontend), tinggal
// kalikan raw value (Wh) dengan factor di bawah. Decimals dibedakan per
// satuan biar MWh (angkanya kecil) tetap kebaca, bukan 0.000.
const UNITS = {
  wh: { key: "wh", label: "Wh", factor: 1, decimals: 2 },
  kwh: { key: "kwh", label: "kWh", factor: 1 / 1e3, decimals: 3 },
  mwh: { key: "mwh", label: "MWh", factor: 1 / 1e6, decimals: 5 },
};

// Daftar meter yang bisa dipilih di dropdown. Backend cuma query 1 tabel
// sesuai `meter` yang dikirim (lihat ENERGY_POWER_TABLES di
// databaseControllers.js). Dipakai bareng-bareng sama kedua tab (Total
// Energy & Analisa Parameter) karena sumber tabelnya sama.
const METERS = [
  { key: "uty1", label: "PP UTY1", colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "lapi1", label: "PP LAPI1", colorLight: "#32cd32", colorDark: "#00ff00" },
    { key: "SDP2_Pro1", label: "SDP2_Pro1", colorLight: "#ceff1e", colorDark: "#ceff1e" },
  { key: "SDP1_Ofc1", label: "SDP1_Ofc1", colorLight: "#cd32b8", colorDark: "#cd32b8" },
];

// Parameter listrik instan (data_format_0..3) - BUKAN totalizer, jadi
// dianalisa pakai AVG/MAX/MIN per periode (bukan delta kayak Total Energy).
// Tambah entry di sini kalau nanti ada parameter baru, harus sinkron sama
// key di response backend (voltage/current/power/frequency).
const PARAMS = [
  { key: "voltage", label: "Tegangan L-N", unit: "V", colorLight: "#1e90ff", colorDark: "#00bfff" },
  { key: "current", label: "Arus", unit: "A", colorLight: "#32cd32", colorDark: "#00ff00" },
  { key: "power", label: "Daya", unit: "kW", colorLight: "#ff8c00", colorDark: "#ffa500" },
  { key: "frequency", label: "Frekuensi", unit: "Hz", colorLight: "#a855f7", colorDark: "#c084fc" },
];

// ════════════════════════════════════════════════════════════════════════
// TAB 1 - TOTAL ENERGY (Wh/kWh/MWh), totalizer delta per periode
// ════════════════════════════════════════════════════════════════════════
function TotalEnergyPanel() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // [{ id, label, value }] - hasil delta totalizer per periode, dalam Wh
  // (satuan mentah dari backend), HANYA buat meter yang lagi dipilih.
  const [mergedData, setMergedData] = useState([]);

  // Meter yang lagi ditampilkan di grafik & tabel.
  const [selectedMeterKey, setSelectedMeterKey] = useState(METERS[0].key);
  // Satuan tampilan: wh / kwh / mwh - checkbox exclusive (mirip radio),
  // gak ngubah data yang di-fetch, cuma ngonversi tampilan value-nya.
  const [unitKey, setUnitKey] = useState("wh");
  // Toggle garis rata-rata di grafik.
  const [showAverageLine, setShowAverageLine] = useState(true);

  // Nandain udah pernah submit valid sekali - dipakai buat auto re-fetch
  // pas dropdown meter diganti, tanpa nembak API pas awal mount.
  const hasFetchedRef = useRef(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isTableVisible, setIsTableVisible] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { colorMode } = useColorMode();
  const borderColor = useColorModeValue(
    "rgba(var(--color-border))",
    "rgba(var(--color-border))"
  );
  const tulisanColor = useColorModeValue(
    "rgba(var(--color-text))",
    "rgba(var(--color-text))"
  );
  const hoverBorderColor = useColorModeValue(
    "rgba(var(--color-border2))",
    "rgba(var(--color-border2))"
  );

  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );
  const userGlobal = useSelector((state) => state.user.user);

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

  const calcStats = (rows, key) => {
    if (!rows || rows.length === 0) return { avg: 0, max: 0, min: 0, total: 0 };
    const vals = rows.map((r) => Number(r[key]) || 0);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = sum / vals.length;
    return { avg, max, min, total: sum };
  };

  const selectedMeter = METERS.find((m) => m.key === selectedMeterKey) || METERS[0];
  const selectedUnit = UNITS[unitKey] || UNITS.wh;

  // Data mentah (Wh) dikonversi ke satuan yang lagi dipilih (Wh/kWh/MWh) -
  // dipakai buat chart, tabel, dan PDF export. mergedData sendiri TETAP Wh,
  // biar ganti checkbox satuan gak perlu fetch ulang ke backend.
  const displayData = useMemo(
    () =>
      mergedData.map((r) => ({
        ...r,
        value: Number((Number(r.value) * selectedUnit.factor).toFixed(selectedUnit.decimals)),
      })),
    [mergedData, selectedUnit]
  );

  // Garis fluktuatif: dari displayData (udah dikonversi ke satuan terpilih).
  const selectedChartData = useMemo(
    () => displayData.map((r, idx) => ({ x: idx, y: Number(r.value) || 0, label: r.label })),
    [displayData]
  );

  // Avg/Max/Min/Total dihitung dari data mentah (Wh) dulu baru dikonversi -
  // biar gak numpuk pembulatan ganda (per-baris lalu dijumlah lagi).
  const rawStats = useMemo(() => calcStats(mergedData, "value"), [mergedData]);
  const selectedStats = useMemo(() => {
    const f = selectedUnit.factor;
    const d = selectedUnit.decimals;
    return {
      avg: Number((rawStats.avg * f).toFixed(d)),
      max: Number((rawStats.max * f).toFixed(d)),
      min: Number((rawStats.min * f).toFixed(d)),
      total: Number((rawStats.total * f).toFixed(d)),
    };
  }, [rawStats, selectedUnit]);

  // Garis rata-rata = GARIS LURUS di nilai selectedStats.avg, dibentang di
  // sepanjang sumbu-x yang sama kayak data fluktuatifnya.
  const avgChartData = useMemo(
    () => displayData.map((r, idx) => ({ x: idx, y: selectedStats.avg, label: r.label })),
    [displayData, selectedStats.avg]
  );

  const getSubmit = async () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    hasFetchedRef.current = true; // dari sini, ganti dropdown meter auto re-fetch
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        "http://10.163.0.66:8002/part/getEnergyPowerHistorical",
        {
          params: {
            start: datePickerStart.replace("T", " "),
            finish: datePickerFinish.replace("T", " "),
            period: periodType,
            meter: selectedMeterKey, // backend cuma query 1 tabel sesuai ini
          },
        }
      );

      const rows = response.data.data || [];
      setMergedData(rows);
      setCurrentPage(1);
      setIsTableVisible(true);

      if (rows.length === 0) {
        setError("Tidak ada data pada rentang tanggal ini");
      }

      await logAuditAction("VIEW_ENERGY_POWER", {
        start: datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        area: selectedMeterKey,
      });
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to fetch data. Please try again.");
    } finally {
      const delay = 800;
      setTimeout(() => {
        setLoading(false);
      }, delay);
    }
  };

  // Ganti dropdown meter (PP UTY1 / PP LAPI1 / ...) -> tarik ulang data
  // KHUSUS meter itu aja, pakai start-finish yang sama kayak submit
  // terakhir. Gak jalan kalau belum pernah submit valid (hasFetchedRef).
  useEffect(() => {
    if (hasFetchedRef.current) {
      getSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterKey]);

  const datePickStart = (e) => {
    setDatePickerStart(e.target.value);
  };
  const datePickFinish = (e) => {
    setDatePickerFinish(e.target.value);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };
  const handleNextPage = () => {
    setCurrentPage((prev) =>
      Math.min(prev + 1, Math.max(Math.ceil(displayData.length / rowsPerPage), 1))
    );
  };

  const renderTable = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const visibleData = displayData.slice(startIndex, startIndex + rowsPerPage);

    if (displayData.length === 0) {
      return (
        <Tr>
          <Td colSpan={3} textAlign="center" display="table-cell">
            No data available
          </Td>
        </Tr>
      );
    }

    return visibleData.map((row) => (
      <Tr key={row.id}>
        <Td>{row.id}</Td>
        <Td>{row.label}</Td>
        <Td>{row.value}</Td>
      </Tr>
    ));
  };

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

    const columns = [
      { header: "No", dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      { header: `${selectedMeter.label} (${selectedUnit.label})`, dataKey: "value" },
    ];

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

    drawHeader();

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Summary - ${PERIOD_LABELS[periodType]} (${selectedMeter.label} - ${selectedUnit.label})`, 14, 32);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      head: [["", `${selectedMeter.label} (${selectedUnit.label})`]],
      body: [
        ["Total", String(selectedStats.total)],
        ["Avg", String(selectedStats.avg)],
        ["Max", String(selectedStats.max)],
        ["Min", String(selectedStats.min)],
      ],
      startY: 34,
      margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 2, halign: "center" },
      headStyles: {
        fillColor: [52, 144, 220],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100], cellWidth: 45 },
        1: { textColor: [0, 0, 139], cellWidth: 60 },
      },
      theme: "grid",
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    const summaryFinalY = doc.lastAutoTable.finalY;

    autoTable(doc, {
      columns,
      body: displayData,
      startY: summaryFinalY + 5,
      margin: { top: 35, bottom: 20 },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.height;
        const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
        if (currentDocPage > 1) drawHeader();

        doc.setFontSize(9);
        doc.text(
          `Generated by EMS System - Energy Power (${PERIOD_LABELS[periodType]} - ${selectedMeter.label} - ${selectedUnit.label}) - ${formattedDateTime} - ${userGlobal.username}`,
          14,
          pageHeight - 10
        );
        doc.text(
          `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${totalPagesExp}`,
          pageWidth - 14,
          pageHeight - 10,
          { align: "right" }
        );
      },
    });

    if (typeof doc.putTotalPages === "function") {
      doc.putTotalPages(totalPagesExp);
    }

    doc.save(`table-data-EnergyPower-${selectedMeter.label.replace(/\s+/g, "")}-${selectedUnit.label}-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF", {
      start: datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      area: selectedMeterKey,
    });
  };

  // 1 chart, isinya garis meter yang lagi dipilih (satuan sesuai checkbox
  // Wh/kWh/MWh) + garis rata-rata (opsional, ngikutin checkbox showAverageLine).
  const chartOptions = useMemo(() => {
    const meterColor = isDarkMode ? selectedMeter.colorDark : selectedMeter.colorLight;
    const avgColor = isDarkMode ? "#ffa500" : "#ff8c00";

    const series = [
      {
        type: "line",
        name: selectedMeter.label,
        showInLegend: true,
        xValueFormatString: "",
        yValueFormatString: "",
        color: meterColor,
        lineColor: meterColor,
        markerColor: meterColor,
        dataPoints: selectedChartData,
      },
    ];

    if (showAverageLine) {
      series.push({
        type: "line",
        name: "Rata-rata",
        showInLegend: true,
        xValueFormatString: "",
        yValueFormatString: "",
        color: avgColor,
        lineColor: avgColor,
        lineDashType: "dash",
        markerSize: 0,
        markerColor: avgColor,
        dataPoints: avgChartData,
      });
    }

    return {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      Margin: 8,
      title: {
        text: `Total Energy - ${selectedMeter.label}`,
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `${PERIOD_LABELS[periodType]} (${selectedUnit.label})`,
          fontColor: isDarkMode ? "white" : "black",
        },
      ],
      axisY: {
        title: `Energi (${selectedUnit.label})`,
        titleFontColor: isDarkMode ? "white" : "black",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "white" : "black",
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
        tickLength: 5,
        tickThickness: 2,
      },
      axisX: {
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        labelFontColor: isDarkMode ? "white" : "black",
        labelAngle: -30,
        tickLength: 5,
        tickThickness: 2,
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      legend: {
        fontColor: isDarkMode ? "white" : "black",
      },
      toolTip: { shared: true },
      data: series,
    };
  }, [selectedMeter, selectedChartData, avgChartData, showAverageLine, isDarkMode, periodType, selectedUnit]);

  const renderChart = () => (
    <div className="w-full max-w-5xl mx-auto block bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
      {loading ? (
        <div className="flex flex-col items-center py-10">
          <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="xl" />
        </div>
      ) : error && mergedData.length === 0 ? (
        <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
      ) : (
        <CanvasJSChart options={chartOptions} />
      )}
    </div>
  );

  return (
    <div>
      <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap">
        <div>
          <h5 className="mb-1">Periode</h5>
          <Select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value)}
            size="md"
            width="160px"
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          >
            <option value="hourly">Per Jam</option>
            <option value="daily">Per Hari</option>
            <option value="monthly">Per Bulan</option>
          </Select>
        </div>
        <div>
          <h5 className="mb-1">Meter</h5>
          <Select
            value={selectedMeterKey}
            onChange={(e) => setSelectedMeterKey(e.target.value)}
            size="md"
            width="160px"
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          >
            {METERS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <h5 className="mb-1"> Start Date</h5>
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
          <h5 className="mb-1"> Finish Date </h5>
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
            <Button onClick={() => getSubmit()} colorScheme="blue">
              Submit
            </Button>
          </div>
          <div className="ml-2 mt-7">
            <Button onClick={exportToPDF} colorScheme="red" isDisabled={userGlobal.level < 3}>
              Export to PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Checkbox pilih satuan tampilan - Wh / kWh / MWh. Exclusive (mirip
          radio): pilih satu otomatis lepas yang lain, gak bisa kosong. */}
      <div className="flex justify-center gap-6 mt-2">
        <Checkbox
          isChecked={unitKey === "wh"}
          onChange={() => setUnitKey("wh")}
          colorScheme="blue"
        >
          <span className="text-text">Wh</span>
        </Checkbox>
        <Checkbox
          isChecked={unitKey === "kwh"}
          onChange={() => setUnitKey("kwh")}
          colorScheme="blue"
        >
          <span className="text-text">kWh</span>
        </Checkbox>
        <Checkbox
          isChecked={unitKey === "mwh"}
          onChange={() => setUnitKey("mwh")}
          colorScheme="blue"
        >
          <span className="text-text">MWh</span>
        </Checkbox>
      </div>

      {/* Checkbox toggle garis rata-rata di grafik */}
      <div className="flex justify-center mt-2">
        <Checkbox
          isChecked={showAverageLine}
          onChange={(e) => setShowAverageLine(e.target.checked)}
          colorScheme="orange"
        >
          <span className="text-text">Averages</span>
        </Checkbox>
      </div>

      {/* 1 chart: garis meter yang dipilih + garis rata-rata (opsional) */}
      <div className="my-4 mx-4">{renderChart()}</div>

      <Stack className="flex flex-row justify-center mb-4 flex-wrap" direction="row" spacing={4} align="center">
        <div className="mt-3">
          <div className="ml-16 text-text font-semibold">Total {selectedMeter.label} = {selectedStats.total.toLocaleString()} {selectedUnit.label}</div>
          <div className="ml-16 text-text">Avg {selectedMeter.label} = {selectedStats.avg.toLocaleString()} {selectedUnit.label}</div>
          <div className="ml-16 text-text">Max {selectedMeter.label} = {selectedStats.max.toLocaleString()} {selectedUnit.label}</div>
          <div className="ml-16 text-text">Min {selectedMeter.label} = {selectedStats.min.toLocaleString()} {selectedUnit.label}</div>
        </div>
      </Stack>

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

      {isTableVisible && (
        <div className="mt-8 mx-20 bg-card rounded-md">
          <TableContainer>
            <Table key={colorMode} variant="simple">
              <TableCaption sx={{ color: tulisanColor }}>Energy Power - {selectedMeter.label}</TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>No</Th>
                  <Th sx={{ color: tulisanColor }}>Periode</Th>
                  <Th sx={{ color: tulisanColor }}>{selectedMeter.label} ({selectedUnit.label})</Th>
                </Tr>
              </Thead>
              <Tbody>{renderTable()}</Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      <div className="flex justify-center items-center my-4 gap-4">
        <Button onClick={handlePrevPage} isDisabled={currentPage === 1} colorScheme="blue">
          Previous
        </Button>
        <span className="text-text">
          Page {currentPage} of {Math.max(Math.ceil(displayData.length / rowsPerPage), 1)}
        </span>
        <Button
          onClick={handleNextPage}
          isDisabled={currentPage === Math.max(Math.ceil(displayData.length / rowsPerPage), 1)}
          colorScheme="blue"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB 2 - ANALISA PARAMETER LISTRIK (Voltage L-N, Current, Power, Frequency)
// Beda karakteristik sama Total Energy: ini bacaan INSTAN (bukan totalizer),
// jadi dianalisa pakai AVG/MAX/MIN per periode (dihitung langsung di SQL,
// lihat getEnergyPowerParameters di databaseControllers.js), bukan delta.
// Ditampilkan 4 mini-chart terpisah (skala V/A/kW/Hz beda jauh, gak masuk
// akal digabung 1 sumbu-Y) dengan band Max/Avg/Min biar kelihatan kalau ada
// tegangan drop atau lonjakan arus/daya di rentang tanggal yang dipilih.
// ════════════════════════════════════════════════════════════════════════
function ParameterAnalysisPanel() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // [{ id, label, voltage:{avg,max,min}, current:{...}, power:{...}, frequency:{...} }]
  const [parameterData, setParameterData] = useState([]);

  const [selectedMeterKey, setSelectedMeterKey] = useState(METERS[0].key);

  const hasFetchedRef = useRef(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isTableVisible, setIsTableVisible] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { colorMode } = useColorMode();
  const borderColor = useColorModeValue(
    "rgba(var(--color-border))",
    "rgba(var(--color-border))"
  );
  const tulisanColor = useColorModeValue(
    "rgba(var(--color-text))",
    "rgba(var(--color-text))"
  );
  const hoverBorderColor = useColorModeValue(
    "rgba(var(--color-border2))",
    "rgba(var(--color-border2))"
  );

  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );
  const userGlobal = useSelector((state) => state.user.user);

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

  const selectedMeter = METERS.find((m) => m.key === selectedMeterKey) || METERS[0];

  // Statistik keseluruhan rentang Start-Finish yang lagi ditarik, per
  // parameter. avg = rata-rata dari avg per-bucket (bukan di-weight per
  // jumlah sample tiap bucket - cukup akurat buat kebutuhan monitoring ini).
  // max/min = ekstrem dari max/min tiap bucket sepanjang rentang tsb.
  const paramStats = useMemo(() => {
    const stats = {};
    PARAMS.forEach((p) => {
      const avgs = parameterData.map((r) => r[p.key]?.avg).filter((v) => v !== null && v !== undefined);
      const maxs = parameterData.map((r) => r[p.key]?.max).filter((v) => v !== null && v !== undefined);
      const mins = parameterData.map((r) => r[p.key]?.min).filter((v) => v !== null && v !== undefined);
      stats[p.key] = {
        avg: avgs.length ? Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2)) : 0,
        max: maxs.length ? Number(Math.max(...maxs).toFixed(2)) : 0,
        min: mins.length ? Number(Math.min(...mins).toFixed(2)) : 0,
      };
    });
    return stats;
  }, [parameterData]);

  // Chart per parameter: 3 garis (Max putus-putus, Avg garis solid berwarna,
  // Min putus-putus) - dibangun ulang tiap parameterData/isDarkMode/periodType
  // berubah.
  const chartOptionsByParam = useMemo(() => {
    const opts = {};
    const bandColor = isDarkMode ? "#8a8a8a" : "#9a9a9a";

    PARAMS.forEach((p) => {
      const color = isDarkMode ? p.colorDark : p.colorLight;
      const avgPoints = parameterData.map((r, idx) => ({ x: idx, y: r[p.key]?.avg ?? null, label: r.label }));
      const maxPoints = parameterData.map((r, idx) => ({ x: idx, y: r[p.key]?.max ?? null, label: r.label }));
      const minPoints = parameterData.map((r, idx) => ({ x: idx, y: r[p.key]?.min ?? null, label: r.label }));

      opts[p.key] = {
        zoomEnabled: true,
        theme: isDarkMode ? "dark2" : "light2",
        backgroundColor: isDarkMode ? "#171717" : "#ffffff",
        Margin: 8,
        title: {
          text: `${p.label} (${p.unit})`,
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 14,
        },
        subtitles: [
          {
            text: `${selectedMeter.label} - ${PERIOD_LABELS[periodType]}`,
            fontColor: isDarkMode ? "white" : "black",
            fontSize: 10,
          },
        ],
        axisY: {
          title: p.unit,
          titleFontColor: isDarkMode ? "white" : "black",
          gridColor: isDarkMode ? "#444" : "#bfbfbf",
          labelFontColor: isDarkMode ? "white" : "black",
          lineColor: isDarkMode ? "#d6d6d6" : "#474747",
          tickColor: isDarkMode ? "#d6d6d6" : "#474747",
        },
        axisX: {
          lineColor: isDarkMode ? "#d6d6d6" : "#474747",
          labelFontColor: isDarkMode ? "white" : "black",
          labelAngle: -30,
          tickColor: isDarkMode ? "#d6d6d6" : "#474747",
        },
        legend: {
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 10,
        },
        toolTip: { shared: true },
        data: [
          {
            type: "line",
            name: "Max",
            showInLegend: true,
            color: bandColor,
            lineColor: bandColor,
            lineDashType: "dot",
            markerSize: 0,
            dataPoints: maxPoints,
          },
          {
            type: "line",
            name: p.label,
            showInLegend: true,
            color,
            lineColor: color,
            markerColor: color,
            dataPoints: avgPoints,
          },
          {
            type: "line",
            name: "Min",
            showInLegend: true,
            color: bandColor,
            lineColor: bandColor,
            lineDashType: "dot",
            markerSize: 0,
            dataPoints: minPoints,
          },
        ],
      };
    });

    return opts;
  }, [parameterData, isDarkMode, periodType, selectedMeter]);

  const getSubmit = async () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    hasFetchedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        "http://10.163.0.66:8002/part/getEnergyPowerParameters",
        {
          params: {
            start: datePickerStart.replace("T", " "),
            finish: datePickerFinish.replace("T", " "),
            period: periodType,
            meter: selectedMeterKey,
          },
        }
      );

      const rows = response.data.data || [];
      setParameterData(rows);
      setCurrentPage(1);
      setIsTableVisible(true);

      if (rows.length === 0) {
        setError("Tidak ada data pada rentang tanggal ini");
      }

      await logAuditAction("VIEW_ENERGY_POWER_PARAMETERS", {
        start: datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        area: selectedMeterKey,
      });
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to fetch data. Please try again.");
    } finally {
      const delay = 800;
      setTimeout(() => {
        setLoading(false);
      }, delay);
    }
  };

  // Ganti dropdown meter -> tarik ulang data khusus meter itu, pakai
  // start-finish yang sama kayak submit terakhir.
  useEffect(() => {
    if (hasFetchedRef.current) {
      getSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeterKey]);

  const datePickStart = (e) => {
    setDatePickerStart(e.target.value);
  };
  const datePickFinish = (e) => {
    setDatePickerFinish(e.target.value);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };
  const handleNextPage = () => {
    setCurrentPage((prev) =>
      Math.min(prev + 1, Math.max(Math.ceil(parameterData.length / rowsPerPage), 1))
    );
  };

  const renderTable = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const visibleData = parameterData.slice(startIndex, startIndex + rowsPerPage);

    if (parameterData.length === 0) {
      return (
        <Tr>
          <Td colSpan={6} textAlign="center" display="table-cell">
            No data available
          </Td>
        </Tr>
      );
    }

    return visibleData.map((row) => (
      <Tr key={row.id}>
        <Td>{row.id}</Td>
        <Td>{row.label}</Td>
        <Td>{row.voltage?.avg ?? "-"}</Td>
        <Td>{row.current?.avg ?? "-"}</Td>
        <Td>{row.power?.avg ?? "-"}</Td>
        <Td>{row.frequency?.avg ?? "-"}</Td>
      </Tr>
    ));
  };

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

    const columns = [
      { header: "No", dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      { header: "Tegangan (V)", dataKey: "voltageAvg" },
      { header: "Arus (A)", dataKey: "currentAvg" },
      { header: "Daya (kW)", dataKey: "powerAvg" },
      { header: "Frekuensi (Hz)", dataKey: "freqAvg" },
    ];

    const bodyRows = parameterData.map((r) => ({
      id: r.id,
      label: r.label,
      voltageAvg: r.voltage?.avg ?? "-",
      currentAvg: r.current?.avg ?? "-",
      powerAvg: r.power?.avg ?? "-",
      freqAvg: r.frequency?.avg ?? "-",
    }));

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

    drawHeader();

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Summary - ${PERIOD_LABELS[periodType]} (${selectedMeter.label})`, 14, 32);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      head: [["Parameter", "Avg", "Max", "Min"]],
      body: PARAMS.map((p) => [
        `${p.label} (${p.unit})`,
        String(paramStats[p.key]?.avg ?? 0),
        String(paramStats[p.key]?.max ?? 0),
        String(paramStats[p.key]?.min ?? 0),
      ]),
      startY: 34,
      margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 2, halign: "center" },
      headStyles: {
        fillColor: [52, 144, 220],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100], cellWidth: 45 },
      },
      theme: "grid",
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    const summaryFinalY = doc.lastAutoTable.finalY;

    autoTable(doc, {
      columns,
      body: bodyRows,
      startY: summaryFinalY + 5,
      margin: { top: 35, bottom: 20 },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.height;
        const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
        if (currentDocPage > 1) drawHeader();

        doc.setFontSize(9);
        doc.text(
          `Generated by EMS System - Power Parameters (${PERIOD_LABELS[periodType]} - ${selectedMeter.label}) - ${formattedDateTime} - ${userGlobal.username}`,
          14,
          pageHeight - 10
        );
        doc.text(
          `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${totalPagesExp}`,
          pageWidth - 14,
          pageHeight - 10,
          { align: "right" }
        );
      },
    });

    if (typeof doc.putTotalPages === "function") {
      doc.putTotalPages(totalPagesExp);
    }

    doc.save(`table-data-EnergyPowerParams-${selectedMeter.label.replace(/\s+/g, "")}-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF", {
      start: datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      area: selectedMeterKey,
    });
  };

  const renderParamCharts = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4 mx-4">
      {PARAMS.map((p) => (
        <div key={p.key} className="w-full bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center py-10">
              <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="lg" />
            </div>
          ) : error && parameterData.length === 0 ? (
            <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
          ) : (
            <CanvasJSChart options={chartOptionsByParam[p.key]} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap">
        <div>
          <h5 className="mb-1">Periode</h5>
          <Select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value)}
            size="md"
            width="160px"
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          >
            <option value="hourly">Per Jam</option>
            <option value="daily">Per Hari</option>
            <option value="monthly">Per Bulan</option>
          </Select>
        </div>
        <div>
          <h5 className="mb-1">Meter</h5>
          <Select
            value={selectedMeterKey}
            onChange={(e) => setSelectedMeterKey(e.target.value)}
            size="md"
            width="160px"
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          >
            {METERS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <h5 className="mb-1"> Start Date</h5>
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
          <h5 className="mb-1"> Finish Date </h5>
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
            <Button onClick={() => getSubmit()} colorScheme="blue">
              Submit
            </Button>
          </div>
          <div className="ml-2 mt-7">
            <Button onClick={exportToPDF} colorScheme="red" isDisabled={userGlobal.level < 3}>
              Export to PDF
            </Button>
          </div>
        </div>
      </div>

      {/* 4 mini-chart: Tegangan L-N, Arus, Daya, Frekuensi - masing-masing
          pakai band Max (putus-putus atas) / Avg (garis solid) / Min
          (putus-putus bawah) biar kelihatan sebaran & ekstrem tiap periode. */}
      {renderParamCharts()}

      <Stack className="flex flex-row justify-center mb-4 flex-wrap" direction="row" spacing={8} align="start">
        {PARAMS.map((p) => (
          <div key={p.key} className="mt-3">
            <div className="text-text font-semibold">{p.label} ({p.unit})</div>
            <div className="text-text">Avg = {(paramStats[p.key]?.avg ?? 0).toLocaleString()} {p.unit}</div>
            <div className="text-text">Max = {(paramStats[p.key]?.max ?? 0).toLocaleString()} {p.unit}</div>
            <div className="text-text">Min = {(paramStats[p.key]?.min ?? 0).toLocaleString()} {p.unit}</div>
          </div>
        ))}
      </Stack>

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

      {isTableVisible && (
        <div className="mt-8 mx-20 bg-card rounded-md">
          <TableContainer>
            <Table key={colorMode} variant="simple">
              <TableCaption sx={{ color: tulisanColor }}>Parameter Listrik - {selectedMeter.label}</TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>No</Th>
                  <Th sx={{ color: tulisanColor }}>Periode</Th>
                  <Th sx={{ color: tulisanColor }}>Tegangan (V)</Th>
                  <Th sx={{ color: tulisanColor }}>Arus (A)</Th>
                  <Th sx={{ color: tulisanColor }}>Daya (kW)</Th>
                  <Th sx={{ color: tulisanColor }}>Frekuensi (Hz)</Th>
                </Tr>
              </Thead>
              <Tbody>{renderTable()}</Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      <div className="flex justify-center items-center my-4 gap-4">
        <Button onClick={handlePrevPage} isDisabled={currentPage === 1} colorScheme="blue">
          Previous
        </Button>
        <span className="text-text">
          Page {currentPage} of {Math.max(Math.ceil(parameterData.length / rowsPerPage), 1)}
        </span>
        <Button
          onClick={handleNextPage}
          isDisabled={currentPage === Math.max(Math.ceil(parameterData.length / rowsPerPage), 1)}
          colorScheme="blue"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB 3 - PERBANDINGAN METER (multi-meter comparison)
//
// Beda sama Total Energy (yang cuma nampilin 1 meter): tab ini narik data
// SEMUA meter yang dipilih user (checkbox, default: semua ke-select) secara
// paralel (Promise.all ke endpoint yang sama, getEnergyPowerHistorical,
// tetap dipanggil sekali per meter karena backend cuma bisa query 1 tabel
// per request) lalu digabung jadi:
//   1. Grafik garis multi-series (1 garis per meter, warna ngikutin METERS)
//   2. Grafik doughnut % kontribusi totalizer tiap meter ke total gabungan
//   3. Ranking + insight singkat otomatis (tertinggi / terendah / total)
//   4. Tabel gabungan (kolom otomatis ngikutin meter yang lagi dipilih)
//
// PENTING - biar "otomatis nambah" kalau nanti ada meter baru: SEMUA bagian
// di bawah (checkbox pilih meter, garis di grafik, slice doughnut, kolom
// tabel, warna ranking) di-generate dari array METERS di atas file ini /
// dari selectedMeterKeys (subset METERS). Jadi kalau ada meter ke-5, ke-6,
// dst, tinggal tambah 1 entry baru di array METERS (key, label, colorLight,
// colorDark) - tab ini otomatis ikut nampilin tanpa perlu diubah lagi.
// ════════════════════════════════════════════════════════════════════════
function ComparisonPanel() {
  const [periodType, setPeriodType] = useState("hourly");
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  // Default: semua meter ke-select ("keseluruhan"). User bisa uncheck
  // satu-satu buat bandingin "beberapa unit" aja.
  const [selectedMeterKeys, setSelectedMeterKeys] = useState(METERS.map((m) => m.key));
  const [unitKey, setUnitKey] = useState("wh");

  // { [meterKey]: rows[] } - hasil fetch per meter, rows dalam Wh mentah
  // (sama kayak TotalEnergyPanel), dikonversi ke satuan terpilih pas dipakai
  // biar ganti checkbox Wh/kWh/MWh gak perlu fetch ulang.
  const [comparisonData, setComparisonData] = useState({});

  const hasFetchedRef = useRef(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [isTableVisible, setIsTableVisible] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { colorMode } = useColorMode();
  const borderColor = useColorModeValue("rgba(var(--color-border))", "rgba(var(--color-border))");
  const tulisanColor = useColorModeValue("rgba(var(--color-text))", "rgba(var(--color-text))");
  const hoverBorderColor = useColorModeValue("rgba(var(--color-border2))", "rgba(var(--color-border2))");

  const [isDarkMode, setIsDarkMode] = useState(
    document.documentElement.getAttribute("data-theme") === "dark"
  );
  const userGlobal = useSelector((state) => state.user.user);

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

  const selectedUnit = UNITS[unitKey] || UNITS.wh;
  const allSelected = selectedMeterKeys.length === METERS.length;

  const toggleMeter = (key) => {
    setSelectedMeterKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  const toggleSelectAll = () => {
    setSelectedMeterKeys((prev) => (prev.length === METERS.length ? [] : METERS.map((m) => m.key)));
  };

  const getSubmit = async () => {
    if (!datePickerStart || !datePickerFinish) {
      setError("Pilih tanggal mulai dan selesai dulu");
      return;
    }
    if (selectedMeterKeys.length === 0) {
      setError("Pilih minimal 1 meter untuk dibandingkan");
      return;
    }
    hasFetchedRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // 1 request per meter, ditembak paralel. Kalau salah satu gagal,
      // meter itu dianggap "0 data" biar meter lain tetap tampil.
      const results = await Promise.all(
        selectedMeterKeys.map((key) =>
          axios
            .get("http://10.163.0.66:8002/part/getEnergyPowerHistorical", {
              params: {
                start: datePickerStart.replace("T", " "),
                finish: datePickerFinish.replace("T", " "),
                period: periodType,
                meter: key,
              },
            })
            .then((res) => ({ key, rows: res.data.data || [] }))
            .catch(() => ({ key, rows: [] }))
        )
      );

      const dataMap = {};
      results.forEach((r) => {
        dataMap[r.key] = r.rows;
      });
      setComparisonData(dataMap);
      setCurrentPage(1);
      setIsTableVisible(true);

      const totalRows = results.reduce((sum, r) => sum + r.rows.length, 0);
      if (totalRows === 0) {
        setError("Tidak ada data pada rentang tanggal ini");
      }

      await logAuditAction("VIEW_ENERGY_POWER_COMPARISON", {
        start: datePickerStart,
        finish: datePickerFinish,
        period: periodType,
        area: selectedMeterKeys.join(","),
      });
    } catch (err) {
      console.error("Error fetching comparison data:", err);
      setError("Failed to fetch data. Please try again.");
    } finally {
      const delay = 800;
      setTimeout(() => {
        setLoading(false);
      }, delay);
    }
  };

  const datePickStart = (e) => setDatePickerStart(e.target.value);
  const datePickFinish = (e) => setDatePickerFinish(e.target.value);

  // Statistik mentah (Wh) per meter yang lagi dipilih.
  const meterStatsRaw = useMemo(() => {
    const stats = {};
    selectedMeterKeys.forEach((key) => {
      const rows = comparisonData[key] || [];
      const vals = rows.map((r) => Number(r.value) || 0);
      const total = vals.reduce((a, b) => a + b, 0);
      stats[key] = {
        total,
        avg: vals.length ? total / vals.length : 0,
        max: vals.length ? Math.max(...vals) : 0,
        min: vals.length ? Math.min(...vals) : 0,
        count: vals.length,
      };
    });
    return stats;
  }, [comparisonData, selectedMeterKeys]);

  // Sama kayak di atas tapi udah dikonversi ke satuan terpilih (Wh/kWh/MWh).
  const meterStatsDisplay = useMemo(() => {
    const f = selectedUnit.factor;
    const d = selectedUnit.decimals;
    const out = {};
    Object.entries(meterStatsRaw).forEach(([key, s]) => {
      out[key] = {
        total: Number((s.total * f).toFixed(d)),
        avg: Number((s.avg * f).toFixed(d)),
        max: Number((s.max * f).toFixed(d)),
        min: Number((s.min * f).toFixed(d)),
      };
    });
    return out;
  }, [meterStatsRaw, selectedUnit]);

  // Total gabungan semua meter terpilih (Wh mentah) - basis persentase di
  // doughnut chart, juga ditampilkan dalam satuan terpilih.
  const grandTotalRaw = useMemo(
    () => Object.values(meterStatsRaw).reduce((a, s) => a + s.total, 0),
    [meterStatsRaw]
  );
  const grandTotalDisplay = useMemo(
    () => Number((grandTotalRaw * selectedUnit.factor).toFixed(selectedUnit.decimals)),
    [grandTotalRaw, selectedUnit]
  );

  // Ranking meter dari total energi terbesar -> terkecil, tiap entry udah
  // termasuk % kontribusinya ke grandTotalRaw. Dipakai buat doughnut chart,
  // list ranking, dan insight otomatis.
  const ranking = useMemo(() => {
    return selectedMeterKeys
      .map((key) => {
        const meter = METERS.find((m) => m.key === key);
        const total = meterStatsRaw[key]?.total || 0;
        const pct = grandTotalRaw > 0 ? (total / grandTotalRaw) * 100 : 0;
        return {
          key,
          label: meter?.label || key,
          color: (isDarkMode ? meter?.colorDark : meter?.colorLight) || "#888888",
          totalRaw: total,
          totalDisplay: meterStatsDisplay[key]?.total ?? 0,
          pct: Number(pct.toFixed(2)),
        };
      })
      .sort((a, b) => b.totalRaw - a.totalRaw);
  }, [selectedMeterKeys, meterStatsRaw, meterStatsDisplay, grandTotalRaw, isDarkMode]);

  // Insight singkat otomatis - tertinggi, terendah, total gabungan.
  const insight = useMemo(() => {
    if (ranking.length === 0) return null;
    return { top: ranking[0], bottom: ranking[ranking.length - 1], count: ranking.length };
  }, [ranking]);

  // Grafik garis multi-series, 1 garis per meter yang dipilih.
  const lineChartOptions = useMemo(() => {
    const series = selectedMeterKeys.map((key) => {
      const meter = METERS.find((m) => m.key === key);
      const color = (isDarkMode ? meter?.colorDark : meter?.colorLight) || "#888888";
      const rows = comparisonData[key] || [];
      const dataPoints = rows.map((r, idx) => ({
        x: idx,
        y: Number((Number(r.value) * selectedUnit.factor).toFixed(selectedUnit.decimals)),
        label: r.label,
      }));
      return {
        type: "line",
        name: meter?.label || key,
        showInLegend: true,
        color,
        lineColor: color,
        markerColor: color,
        dataPoints,
      };
    });

    return {
      zoomEnabled: true,
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      Margin: 8,
      title: {
        text: "Perbandingan Total Energy Antar Meter",
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `${PERIOD_LABELS[periodType]} (${selectedUnit.label})`,
          fontColor: isDarkMode ? "white" : "black",
        },
      ],
      axisY: {
        title: `Energi (${selectedUnit.label})`,
        titleFontColor: isDarkMode ? "white" : "black",
        gridColor: isDarkMode ? "#444" : "#bfbfbf",
        labelFontColor: isDarkMode ? "white" : "black",
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      axisX: {
        lineColor: isDarkMode ? "#d6d6d6" : "#474747",
        labelFontColor: isDarkMode ? "white" : "black",
        labelAngle: -30,
        tickColor: isDarkMode ? "#d6d6d6" : "#474747",
      },
      legend: { fontColor: isDarkMode ? "white" : "black" },
      toolTip: { shared: true },
      data: series,
    };
  }, [selectedMeterKeys, comparisonData, isDarkMode, periodType, selectedUnit]);

  // Grafik doughnut % kontribusi totalizer tiap meter terhadap total
  // gabungan - warnanya disamain sama garis di line chart biar gampang
  // dikorelasikan sama mata.
  const pieChartOptions = useMemo(() => {
    const dataPoints = ranking.map((r) => ({
      y: r.pct,
      label: r.label,
      color: r.color,
      indexLabel: `${r.label}: ${r.pct}%`,
    }));

    return {
      theme: isDarkMode ? "dark2" : "light2",
      backgroundColor: isDarkMode ? "#171717" : "#ffffff",
      title: {
        text: "Kontribusi Totalizer per Meter",
        fontColor: isDarkMode ? "white" : "black",
        fontSize: 16,
      },
      subtitles: [
        {
          text: `Total gabungan = ${grandTotalDisplay.toLocaleString()} ${selectedUnit.label}`,
          fontColor: isDarkMode ? "white" : "black",
          fontSize: 11,
        },
      ],
      toolTip: {
        contentFormatter: (e) => `${e.entries[0].dataPoint.label}: ${e.entries[0].dataPoint.y}%`,
      },
      legend: { fontColor: isDarkMode ? "white" : "black", fontSize: 11 },
      data: [
        {
          type: "doughnut",
          showInLegend: true,
          indexLabelFontColor: isDarkMode ? "white" : "black",
          indexLabelFontSize: 10,
          dataPoints,
        },
      ],
    };
  }, [ranking, grandTotalDisplay, selectedUnit, isDarkMode]);

  // Tabel gabungan: baris = periode, kolom = tiap meter yang dipilih.
  // Panjang baris ngikutin meter dengan jumlah bucket terbanyak - normalnya
  // semua meter punya jumlah bucket sama (start/finish/period sama), tapi
  // kalau ada meter yang datanya kurang lengkap tetap aman, selnya "-".
  const combinedRows = useMemo(() => {
    const maxLen = Math.max(0, ...selectedMeterKeys.map((k) => (comparisonData[k] || []).length));
    const rows = [];
    for (let i = 0; i < maxLen; i++) {
      const row = { id: i + 1, label: null };
      selectedMeterKeys.forEach((key) => {
        const r = (comparisonData[key] || [])[i];
        if (r && row.label === null) row.label = r.label;
        row[key] = r ? Number((Number(r.value) * selectedUnit.factor).toFixed(selectedUnit.decimals)) : null;
      });
      rows.push(row);
    }
    return rows;
  }, [comparisonData, selectedMeterKeys, selectedUnit]);

  const handlePrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const handleNextPage = () =>
    setCurrentPage((prev) => Math.min(prev + 1, Math.max(Math.ceil(combinedRows.length / rowsPerPage), 1)));

  const renderTable = () => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const visibleData = combinedRows.slice(startIndex, startIndex + rowsPerPage);

    if (combinedRows.length === 0) {
      return (
        <Tr>
          <Td colSpan={selectedMeterKeys.length + 2} textAlign="center" display="table-cell">
            No data available
          </Td>
        </Tr>
      );
    }

    return visibleData.map((row) => (
      <Tr key={row.id}>
        <Td>{row.id}</Td>
        <Td>{row.label}</Td>
        {selectedMeterKeys.map((key) => (
          <Td key={key}>{row[key] ?? "-"}</Td>
        ))}
      </Tr>
    ));
  };

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

    drawHeader();

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`Perbandingan Meter - ${PERIOD_LABELS[periodType]} (${selectedUnit.label})`, 14, 32);
    doc.setFont("helvetica", "normal");

    autoTable(doc, {
      head: [["Meter", "Total", "Avg", "Max", "Min", "% Kontribusi"]],
      body: ranking.map((r) => [
        r.label,
        String(meterStatsDisplay[r.key]?.total ?? 0),
        String(meterStatsDisplay[r.key]?.avg ?? 0),
        String(meterStatsDisplay[r.key]?.max ?? 0),
        String(meterStatsDisplay[r.key]?.min ?? 0),
        `${r.pct}%`,
      ]),
      startY: 34,
      margin: { left: 10, right: 10 },
      styles: { fontSize: 8, cellPadding: 2, halign: "center" },
      headStyles: {
        fillColor: [52, 144, 220],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 8,
      },
      columnStyles: {
        0: { fontStyle: "bold", halign: "center", fillColor: [235, 245, 255], textColor: [0, 0, 100] },
      },
      theme: "grid",
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
    });

    const summaryFinalY = doc.lastAutoTable.finalY;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Total Gabungan Semua Meter = ${grandTotalDisplay.toLocaleString()} ${selectedUnit.label}`,
      14,
      summaryFinalY + 5
    );
    doc.setFont("helvetica", "normal");

    const columns = [
      { header: "No", dataKey: "id" },
      { header: "Periode", dataKey: "label" },
      ...selectedMeterKeys.map((key) => ({
        header: `${METERS.find((m) => m.key === key)?.label} (${selectedUnit.label})`,
        dataKey: key,
      })),
    ];

    autoTable(doc, {
      columns,
      body: combinedRows,
      startY: summaryFinalY + 10,
      margin: { top: 35, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 1.5 },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.height;
        const currentDocPage = doc.internal.getCurrentPageInfo().pageNumber;
        if (currentDocPage > 1) drawHeader();

        doc.setFontSize(9);
        doc.text(
          `Generated by EMS System - Perbandingan Meter (${PERIOD_LABELS[periodType]} - ${selectedUnit.label}) - ${formattedDateTime} - ${userGlobal.username}`,
          14,
          pageHeight - 10
        );
        doc.text(
          `Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${totalPagesExp}`,
          pageWidth - 14,
          pageHeight - 10,
          { align: "right" }
        );
      },
    });

    if (typeof doc.putTotalPages === "function") {
      doc.putTotalPages(totalPagesExp);
    }

    doc.save(`table-data-EnergyPower-Perbandingan-${selectedUnit.label}-${fileSuffix}.pdf`);

    await logAuditAction("EXPORT_PDF", {
      start: datePickerStart,
      finish: datePickerFinish,
      period: periodType,
      area: selectedMeterKeys.join(","),
    });
  };

  return (
    <div>
      <div className="flex flex-row justify-center space-x-4 my-6 flex-wrap xl:flex-nowrap">
        <div>
          <h5 className="mb-1">Periode</h5>
          <Select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value)}
            size="md"
            width="160px"
            sx={{
              border: "1px solid",
              borderColor: borderColor,
              borderRadius: "0.395rem",
              background: "var(--color-background)",
              _hover: { borderColor: hoverBorderColor },
            }}
          >
            <option value="hourly">Per Jam</option>
            <option value="daily">Per Hari</option>
            <option value="monthly">Per Bulan</option>
          </Select>
        </div>
        <div>
          <h5 className="mb-1"> Start Date</h5>
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
          <h5 className="mb-1"> Finish Date </h5>
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
            <Button onClick={() => getSubmit()} colorScheme="blue">
              Submit
            </Button>
          </div>
          <div className="ml-2 mt-7">
            <Button onClick={exportToPDF} colorScheme="red" isDisabled={userGlobal.level < 3}>
              Export to PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Pilih meter: "Semua Meter" (keseluruhan) atau uncheck satu-satu
          buat bandingin beberapa unit aja. Checkbox di-generate dari array
          METERS - otomatis nambah kalau METERS nambah entry baru. */}
      <div className="flex flex-col items-center gap-2 mt-2">
        <Checkbox
          isChecked={allSelected}
          isIndeterminate={selectedMeterKeys.length > 0 && !allSelected}
          onChange={toggleSelectAll}
          colorScheme="blue"
        >
          <span className="text-text font-semibold">Semua Meter</span>
        </Checkbox>
        <div className="flex flex-wrap justify-center gap-4">
          {METERS.map((m) => (
            <Checkbox
              key={m.key}
              isChecked={selectedMeterKeys.includes(m.key)}
              onChange={() => toggleMeter(m.key)}
              colorScheme="blue"
            >
              <span
                className="text-text"
                style={{ borderBottom: `3px solid ${isDarkMode ? m.colorDark : m.colorLight}`, paddingBottom: 1 }}
              >
                {m.label}
              </span>
            </Checkbox>
          ))}
        </div>
      </div>

      {/* Checkbox pilih satuan tampilan - Wh / kWh / MWh */}
      <div className="flex justify-center gap-6 mt-3">
        <Checkbox isChecked={unitKey === "wh"} onChange={() => setUnitKey("wh")} colorScheme="blue">
          <span className="text-text">Wh</span>
        </Checkbox>
        <Checkbox isChecked={unitKey === "kwh"} onChange={() => setUnitKey("kwh")} colorScheme="blue">
          <span className="text-text">kWh</span>
        </Checkbox>
        <Checkbox isChecked={unitKey === "mwh"} onChange={() => setUnitKey("mwh")} colorScheme="blue">
          <span className="text-text">MWh</span>
        </Checkbox>
      </div>

      {/* Grafik garis perbandingan + doughnut kontribusi, berdampingan di
          layar besar, ditumpuk di layar kecil. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 my-4 mx-4">
        <div className="xl:col-span-2 bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center py-10">
              <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="xl" />
            </div>
          ) : error && Object.keys(comparisonData).length === 0 ? (
            <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
          ) : (
            <CanvasJSChart options={lineChartOptions} />
          )}
        </div>
        <div className="bg-card rounded-lg p-1 shadow-lg overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center py-10">
              <Spinner thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" size="lg" />
            </div>
          ) : error && Object.keys(comparisonData).length === 0 ? (
            <div className="text-red-500 flex flex-col items-center py-10">No available data</div>
          ) : (
            <CanvasJSChart options={pieChartOptions} />
          )}
        </div>
      </div>

      {/* Ranking + insight otomatis */}
      {insight && (
        <div className="mx-4 xl:mx-20 mb-6 bg-card rounded-lg p-4 shadow-lg">
          <h5 className="text-text font-semibold mb-3">Ringkasan &amp; Analisa</h5>
          <p className="text-text mb-3">
            Dari {insight.count} meter yang dibandingkan pada periode ini, total energi gabungan adalah{" "}
            <strong>
              {grandTotalDisplay.toLocaleString()} {selectedUnit.label}
            </strong>
            . Konsumen energi tertinggi adalah <strong>{insight.top.label}</strong> dengan kontribusi{" "}
            <strong>{insight.top.pct}%</strong> ({insight.top.totalDisplay.toLocaleString()} {selectedUnit.label}),
            sedangkan yang terendah adalah <strong>{insight.bottom.label}</strong> dengan{" "}
            <strong>{insight.bottom.pct}%</strong> ({insight.bottom.totalDisplay.toLocaleString()} {selectedUnit.label}).
          </p>
          <div className="flex flex-col gap-2">
            {ranking.map((r, idx) => (
              <div key={r.key} className="flex items-center gap-3">
                <span className="text-text w-6">{idx + 1}.</span>
                <span className="text-text w-32 truncate">{r.label}</span>
                <div
                  className="flex-1 rounded h-4 overflow-hidden"
                  style={{ background: isDarkMode ? "#333333" : "#e5e7eb" }}
                >
                  <div className="h-4 rounded" style={{ width: `${r.pct}%`, background: r.color }} />
                </div>
                <span className="text-text w-16 text-right">{r.pct}%</span>
                <span className="text-text w-32 text-right">
                  {r.totalDisplay.toLocaleString()} {selectedUnit.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {isTableVisible && (
        <div className="mt-8 mx-4 xl:mx-20 bg-card rounded-md">
          <TableContainer>
            <Table key={colorMode} variant="simple">
              <TableCaption sx={{ color: tulisanColor }}>Perbandingan Meter</TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>No</Th>
                  <Th sx={{ color: tulisanColor }}>Periode</Th>
                  {selectedMeterKeys.map((key) => (
                    <Th key={key} sx={{ color: tulisanColor }}>
                      {METERS.find((m) => m.key === key)?.label} ({selectedUnit.label})
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>{renderTable()}</Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      <div className="flex justify-center items-center my-4 gap-4">
        <Button onClick={handlePrevPage} isDisabled={currentPage === 1} colorScheme="blue">
          Previous
        </Button>
        <span className="text-text">
          Page {currentPage} of {Math.max(Math.ceil(combinedRows.length / rowsPerPage), 1)}
        </span>
        <Button
          onClick={handleNextPage}
          isDisabled={currentPage === Math.max(Math.ceil(combinedRows.length / rowsPerPage), 1)}
          colorScheme="blue"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Wrapper - Tabs biar gak perlu daftar halaman baru di pagesConfig.js,
// cukup 1 entry "Energy Power" yang isinya 3 tab.
// ════════════════════════════════════════════════════════════════════════
function EnergyPower() {
  return (
    <div>
      <Tabs variant="enclosed" colorScheme="blue" isFitted>
        <TabList className="w-full lg:w-3/4" display="flex">
          <Tab>Total Energy</Tab>
          <Tab>Analisa Parameter Listrik</Tab>
          <Tab>Perbandingan Meter</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <TotalEnergyPanel />
          </TabPanel>
          <TabPanel px={0}>
            <ParameterAnalysisPanel />
          </TabPanel>
          <TabPanel px={0}>
            <ComparisonPanel />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}

export default EnergyPower;