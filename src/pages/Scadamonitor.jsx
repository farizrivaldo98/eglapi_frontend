import { useState, useEffect, useRef } from "react";
import {
  Table, Thead, Tbody, Tr, Th, Td,
  TableCaption, TableContainer,
  Badge, Stack, Input, Button,
  useColorMode, useColorModeValue,
} from "@chakra-ui/react";

// Stasiun diturunkan langsung dari address table DB3 (Correction_SV) —
// harus sama persis dengan vartable di flow Node-RED.
const STATIONS = [
  { station: "Stripping3",    vars: { Tx: "Tx_Stripping3",    Rx: "Rx_Stripping3",    Px: "Px_Stripping3" } },
  { station: "Blistering2",   vars: { Tx: "Tx_Blistering2",   Rx: "Rx_Blistering2",   Px: "Px_Blistering2" } },
  { station: "Stripping2",    vars: { Tx: "Tx_Stripping2",    Rx: "Rx_Stripping2",    Px: "Px_Stripping2" } },
  { station: "Tableting2",    vars: { Tx: "Tx_Tableting2",    Rx: "Rx_Tableting2",    Px: "Px_Tableting2" } },
  { station: "Spare4",        vars: { Tx: "Tx_Spare4",        Rx: "Rx_Spare4",        Px: "Px_Spare4" } },
  { station: "ChangeP3",      vars: { Tx: "Tx_ChangeP3",      Rx: "Rx_ChangeP3",      Px: "Px_ChangeP3" } },
  { station: "StaggingF1",    vars: { Tx: "Tx_StaggingF1",    Rx: "Rx_StaggingF1",    Px: "Px_StaggingF1" } },
  { station: "StaggingWIP3",  vars: { Tx: "Tx_StaggingWIP3",  Rx: "Rx_StaggingWIP3",  Px: "Px_StaggingWIP3" } },
  { station: "Sorting2",      vars: { Tx: "Tx_Sorting2",      Rx: "Rx_Sorting2",      Px: "Px_Sorting2" } },
  { station: "Sorting1",      vars: { Tx: "Tx_Sorting1",      Rx: "Rx_Sorting1",      Px: "Px_Sorting1" } },
  { station: "StaggingWIP2",  vars: { Tx: "Tx_StaggingWIP2",  Rx: "Rx_StaggingWIP2",  Px: "Px_StaggingWIP2" } },
  { station: "Ipc3",          vars: { Tx: "Tx_Ipc3",          Rx: "Rx_Ipc3",          Px: "Px_Ipc3" } },
  { station: "AirLock12",     vars: { Tx: "Tx_AirLock12",     Rx: "Rx_AirLock12",     Px: "Px_AirLock12" } },
  { station: "Airlock10",     vars: { Tx: "Tx_Airlock10",     Rx: "Rx_Airlock10",     Px: "Px_Airlock10" } },
  { station: "AirLock15",     vars: { Tx: "Tx_AirLock15",     Rx: "Rx_AirLock15",     Px: "Px_AirLock15" } },
  { station: "Spare5",        vars: { Tx: "Tx_Spare5",        Rx: "Rx_Spare5",        Px: "Px_Spare5" } },
  { station: "Coating2",      vars: { Tx: "Tx_Coating2",      Rx: "Rx_Coating2",      Px: "Px_Coating2" } },
  { station: "CoatingSP1",    vars: { Tx: "Tx_CoatingSP1",    Rx: "Rx_CoatingSP1",    Px: "Px_CoatingSP1" } },
];

const DEFAULT_WS_URL = "ws://10.163.0.66:1880/ws/scada";

const STATUS_COLOR = {
  live: "green",
  connecting: "orange",
  down: "red",
};

const STATUS_LABEL = {
  live: "Live",
  connecting: "Connecting…",
  down: "Terputus — mencoba lagi 3s",
};

function fmt(n) {
  return typeof n === "number" ? n.toFixed(2) : String(n);
}

export default function ScadaMonitor() {
  const [wsUrl, setWsUrl]         = useState(DEFAULT_WS_URL);
  const [status, setStatus]       = useState("connecting");
  const [values, setValues]       = useState({});   // { tagName: "12.34" }
  const [flashKey, setFlashKey]   = useState(null); // last-updated tag, for highlight
  const [tagCount, setTagCount]   = useState(0);
  const [lastUpdate, setLastUpdate] = useState("—");

  const wsRef    = useRef(null);
  const retryRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  // ── theming (same pattern as UserManagement.jsx) ────────────
  const { colorMode } = useColorMode();
  const tulisanColor  = useColorModeValue(
    "rgba(var(--color-text))",
    "rgba(var(--color-text))"
  );
  // ─────────────────────────────────────────────────────────────

  const connect = () => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    if (wsRef.current) { try { wsRef.current.onclose = null; wsRef.current.close(); } catch (e) {} }

    setStatus("connecting");

    let socket;
    try {
      socket = new WebSocket(wsUrl.trim());
    } catch (err) {
      setStatus("down");
      return;
    }
    wsRef.current = socket;

    socket.onopen = () => setStatus("live");

    socket.onclose = () => {
      setStatus("down");
      retryRef.current = setTimeout(connect, 3000);
    };

    socket.onerror = () => { /* onclose akan menyusul dan menangani retry */ };

    socket.onmessage = (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      const data = msg.data || msg; // toleran kalau Function node format dilewati
      if (!data || typeof data !== "object") return;

      let count = 0;
      const updatedKey = Object.keys(data)[0];

      setValues((prev) => {
        const next = { ...prev };
        Object.keys(data).forEach((key) => {
          count++;
          next[key] = fmt(data[key]);
        });
        return next;
      });

      setTagCount(count);
      setLastUpdate((msg.ts ? new Date(msg.ts) : new Date()).toLocaleTimeString("id-ID"));

      setFlashKey(updatedKey);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => setFlashKey(null), 700);
    };
  };

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (wsRef.current) { try { wsRef.current.onclose = null; wsRef.current.close(); } catch (e) {} }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── render table rows: satu baris per stasiun ────────────────
  const renderTable = () => {
    return STATIONS.map(({ station, vars }) => (
      <Tr key={station}>
        <Td sx={{ color: tulisanColor }}>{station}</Td>
        {["Tx", "Rx", "Px"].map((k) => {
          const tag = vars[k];
          const isFlash = flashKey === tag;
          return (
            <Td
              key={k}
              fontFamily="mono"
              fontVariantNumeric="tabular-nums"
              fontWeight="600"
              bg={isFlash ? "teal.100" : "transparent"}
              transition="background 0.7s ease-out"
              sx={{ color: tulisanColor }}
            >
              {values[tag] ?? "—"}
            </Td>
          );
        })}
      </Tr>
    ));
  };
  // ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-row justify-between items-center mx-6 mt-2 mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">SCADA Live Monitor</h2>
          <p className="text-xs text-gray-400">S7-1200 · DB3 Correction_SV</p>
        </div>

        <Stack direction="row" spacing={3} align="center" flexWrap="wrap">
          <Input
            size="sm"
            width={{ base: "100%", md: "300px" }}
            fontFamily="mono"
            fontSize="xs"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
          />
          <Button size="sm" onClick={connect}>
            Connect
          </Button>
          <Badge colorScheme={STATUS_COLOR[status]} fontSize="0.8em" px={3} py={1}>
            {STATUS_LABEL[status]}
          </Badge>
        </Stack>
      </div>

      <div className="flex flex-row gap-6 mx-6 mb-4">
        <Badge colorScheme="gray" fontSize="0.75em">
          Tags {tagCount}/54
        </Badge>
        <Badge colorScheme="gray" fontSize="0.75em">
          Stations {STATIONS.length}
        </Badge>
        <Badge colorScheme="gray" fontSize="0.75em">
          Update terakhir: {lastUpdate}
        </Badge>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <div className="mt-4 mx-6 bg-card rounded-md shadow-lg">
        <div className="overflow-x-auto">
          <TableContainer>
            <Table key={colorMode} variant="simple" size="sm">
              <TableCaption sx={{ color: tulisanColor }}>
                SCADA Live Monitor — PT. Lapi Laboratories
              </TableCaption>
              <Thead>
                <Tr>
                  <Th sx={{ color: tulisanColor }}>Station</Th>
                  <Th sx={{ color: tulisanColor }}>Tx</Th>
                  <Th sx={{ color: tulisanColor }}>Rx</Th>
                  <Th sx={{ color: tulisanColor }}>Px</Th>
                </Tr>
              </Thead>
              <Tbody>{renderTable()}</Tbody>
            </Table>
          </TableContainer>
        </div>
      </div>
    </div>
  );
}