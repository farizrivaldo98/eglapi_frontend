import { useState } from "react";
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
  Checkbox,
  CheckboxGroup,
  Wrap,
  WrapItem,
  Box,
  Text,
  useColorMode,
  useColorModeValue,
} from "@chakra-ui/react";
import CanvasJSReact from "../canvasjs.react";
import axios from "axios";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { logAuditAction } from "../features/part/userSlice";
import logo from "../assets/logolapi.png";
var CanvasJSChart = CanvasJSReact.CanvasJSChart;

// channels, metrics, apiBase datang dari Chiller.jsx (konfigurasi bersama Realtime & Historical)
// isDarkMode juga datang dari Chiller.jsx supaya observer tema cuma jalan sekali di parent
function ChillerHistorical({ channels, metrics, apiBase, isDarkMode }) {
  // ── STATE UNTUK HISTORICAL ──────────────────────────────────
  const [selectedChannels, setSelectedChannels] = useState(["CH1"]);
  const [selectedMetrics, setSelectedMetrics] = useState(metrics.map((m) => m.key));
  const [channelData, setChannelData] = useState({});
  const [datePickerStart, setDatePickerStart] = useState();
  const [datePickerFinish, setDatePickerFinish] = useState();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPageByChannel, setCurrentPageByChannel] = useState({});
  const [isTableVisible, setIsTableVisible] = useState(true);

  const userGlobal = useSelector((state) => state.user.user);

  const { colorMode } = useColorMode();
  const borderColor = useColorModeValue("rgba(var(--color-border))", "rgba(var(--color-border))");
  const tulisanColor = useColorModeValue("rgba(var(--color-text))", "rgba(var(--color-text))");
  const hoverBorderColor = useColorModeValue("rgba(var(--color-border2))", "rgba(var(--color-border2))");

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
          const channel = channels.find((c) => c.key === chKey);
          const res = await axios.get(`${apiBase}/getAllDataChiller`, {
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
  const activeMetrics = metrics.filter((m) => selectedMetrics.includes(m.key));
  const activeChannels = channels.filter((c) => selectedChannels.includes(c.key));

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
        xValueFormatString: "",
        yValueFormatString: "",
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

  // ── RENDER COMPONENT: HISTORICAL SELECTOR ────────────────
  const renderChannelSelector = () => (
    <CheckboxGroup value={selectedChannels} onChange={toggleChannels}>
      <Wrap spacing={4}>
        {channels.map((channel) => (
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
        {metrics.map((metric) => (
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

  // ── RENDER UTAMA HISTORICAL ─────────────────────────────────
  return (
    <>
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
  );
}

export default ChillerHistorical;
