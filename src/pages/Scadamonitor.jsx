import { useState, useEffect, useRef } from "react";
import {
  Table, Thead, Tbody, Tr, Th, Td,
  TableContainer, Badge, Stack, Button,
  Modal, ModalOverlay, ModalContent, ModalHeader, 
  ModalCloseButton, ModalBody, ModalFooter, useDisclosure,
  useColorModeValue
} from "@chakra-ui/react";

// Stasiun diturunkan dari flow Node-RED
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

const DEFAULT_WS_URL = "ws://10.163.0.66:1880/ws/scada"; // Sesuaikan dengan IP bapak
const STATUS_COLOR = { live: "green", connecting: "orange", down: "red" };

export default function Scadamonitor() {
  const [data, setData] = useState({});
  const [status, setStatus] = useState("down");
  const wsRef = useRef(null);

  // Modal Setup
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [popupData, setPopupData] = useState(null);

  const connectWS = () => {
    setStatus("connecting");
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(DEFAULT_WS_URL);
    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus("down");
    ws.onerror = () => setStatus("down");
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.data) {
          setData((prev) => ({ ...prev, ...payload.data })); // Data DB1 & DB3 otomatis tergabung di sini
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

  // Event handler ketika Tag diklik
  const handleTagClick = (station, type, val) => {
    // Mapping: Tx -> Temp, Rx -> Rh, Px -> Dp (menyesuaikan format penamaan tag di DB1)
    const typeName = type === 'Tx' ? 'Temp' : type === 'Rx' ? 'Rh' : 'Dp';
    
    const spL = data[`${typeName}_${station}_SP_L`];
    const spH = data[`${typeName}_${station}_SP_H`];
    const timer = data[`Min_${type}_${station}`];
    
    setPopupData({
      station,
      type,
      val: val,
      spL: spL !== undefined ? spL : 'N/A',
      spH: spH !== undefined ? spH : 'N/A',
      timer: timer !== undefined ? timer : 'N/A'
    });
    onOpen();
  };

  // Pengecekan status alarm berdasarkan range limit
  const isAlarm = (station, type, val) => {
    if (val === undefined || val === null) return false;
    const typeName = type === 'Tx' ? 'Temp' : type === 'Rx' ? 'Rh' : 'Dp';
    
    const spL = data[`${typeName}_${station}_SP_L`];
    const spH = data[`${typeName}_${station}_SP_H`];
    
    if (spL !== undefined && val < spL) return true;
    if (spH !== undefined && val > spH) return true;
    return false;
  };

  // Pengaturan UI tabel agar garis lebih terlihat
  const borderColor = useColorModeValue("gray.400", "gray.600");
  const tdStyles = {
    borderWidth: "2px",
    borderColor: borderColor,
    textAlign: "center",
    transition: "0.2s ease"
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <style>{`
        @keyframes alertBlink {
          0%, 100% { background-color: transparent; }
          50% { background-color: #fca5a5; color: #7f1d1d; }
        }
        .blinking-alarm {
          animation: alertBlink 1s infinite ease-in-out;
          font-weight: bold;
          cursor: pointer;
        }
        .normal-cell {
          cursor: pointer;
        }
        .normal-cell:hover {
          background-color: rgba(0,0,0,0.05);
        }
      `}</style>

      {/* Control Bar (Bisa disesuaikan dengan layout Bapak sebelumnya) */}
      <div className="p-4 flex gap-4 items-center">
        <Button onClick={connectWS} size="sm" colorScheme="blue">Reconnect WS</Button>
        <Badge colorScheme={STATUS_COLOR[status]}>STATUS: {status.toUpperCase()}</Badge>
      </div>

      <div className="mx-6 mb-4 bg-card rounded-md shadow-lg p-2">
        <TableContainer>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th sx={tdStyles}>Station</Th>
                <Th sx={tdStyles}>Tx (Temp)</Th>
                <Th sx={tdStyles}>Rx (RH)</Th>
                <Th sx={tdStyles}>Px (DP)</Th>
                <Th sx={tdStyles}>Buzzer Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {STATIONS.map((st) => {
                const txVal = data[st.vars.Tx];
                const rxVal = data[st.vars.Rx];
                const pxVal = data[st.vars.Px];
                const buzzerActive = data[`Buzzer_${st.station}`] === true;

                return (
                  <Tr key={st.station}>
                    <Td sx={{...tdStyles, textAlign: "left", fontWeight: "bold"}}>
                      {st.station}
                    </Td>
                    
                    <Td 
                      sx={tdStyles}
                      className={isAlarm(st.station, 'Tx', txVal) ? 'blinking-alarm' : 'normal-cell'}
                      onClick={() => handleTagClick(st.station, 'Tx', txVal)}
                    >
                      {txVal !== undefined ? txVal.toFixed(1) : '-'}
                    </Td>

                    <Td 
                      sx={tdStyles}
                      className={isAlarm(st.station, 'Rx', rxVal) ? 'blinking-alarm' : 'normal-cell'}
                      onClick={() => handleTagClick(st.station, 'Rx', rxVal)}
                    >
                      {rxVal !== undefined ? rxVal.toFixed(1) : '-'}
                    </Td>

                    <Td 
                      sx={tdStyles}
                      className={isAlarm(st.station, 'Px', pxVal) ? 'blinking-alarm' : 'normal-cell'}
                      onClick={() => handleTagClick(st.station, 'Px', pxVal)}
                    >
                      {pxVal !== undefined ? pxVal.toFixed(1) : '-'}
                    </Td>

                    <Td sx={tdStyles}>
                      {buzzerActive ? (
                        <Badge colorScheme="red" className="animate-pulse">🚨 ACTIVE</Badge>
                      ) : (
                        <Badge colorScheme="green">OK</Badge>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      </div>

      {/* Pop-up limit */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader borderBottomWidth="1px">Limit Info - {popupData?.station}</ModalHeader>
          <ModalCloseButton />
          <ModalBody py={4}>
            <Stack spacing={3}>
              <div className="flex justify-between border-b pb-2">
                <span className="font-semibold text-gray-500">Parameter</span>
                <span className="font-bold">{popupData?.type}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="font-semibold text-gray-500">Current Value</span>
                <span className="font-bold text-blue-600">
                  {typeof popupData?.val === 'number' ? popupData.val.toFixed(1) : popupData?.val}
                </span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="font-semibold text-gray-500">High Limit (SP_H)</span>
                <span className="font-bold text-red-500">{popupData?.spH}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="font-semibold text-gray-500">Low Limit (SP_L)</span>
                <span className="font-bold text-orange-500">{popupData?.spL}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="font-semibold text-gray-500">Timer Limit</span>
                <span className="font-bold">{popupData?.timer} (waktu)</span>
              </div>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" onClick={onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}