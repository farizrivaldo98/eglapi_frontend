import { useState, useEffect, useRef } from "react";
import {
  Table, Thead, Tbody, Tr, Th, Td,
  TableContainer, Badge, Stack, Button, Input,
  Modal, ModalOverlay, ModalContent, ModalHeader, 
  ModalCloseButton, ModalBody, ModalFooter, useDisclosure,
  useColorModeValue, useToast
} from "@chakra-ui/react";

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

const DEFAULT_WS_URL = "ws://10.163.0.66:1880/ws/scada"; // Sesuaikan dengan IP
const STATUS_COLOR = { live: "green", connecting: "orange", down: "red" };

export default function Scadamonitor() {
  const [data, setData] = useState({});
  const [status, setStatus] = useState("down");
  const wsRef = useRef(null);
  const toast = useToast();

  // Modal Setup & Input States
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [popupData, setPopupData] = useState(null);
  const [editSpL, setEditSpL] = useState("");
  const [editSpH, setEditSpH] = useState("");
  const [editTimer, setEditTimer] = useState("");

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
        if (payload.data) setData((prev) => ({ ...prev, ...payload.data }));
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

  // Update form values saat pop-up dibuka
  useEffect(() => {
    if (popupData) {
      setEditSpL(popupData.spL !== 'N/A' ? popupData.spL : "");
      setEditSpH(popupData.spH !== 'N/A' ? popupData.spH : "");
      setEditTimer(popupData.timer !== 'N/A' ? popupData.timer : "");
    }
  }, [popupData]);

  const handleTagClick = (station, type, val) => {
    const typeName = type === 'Tx' ? 'Temp' : type === 'Rx' ? 'Rh' : 'Dp';
    setPopupData({
      station,
      type,
      val,
      spL: data[`${typeName}_${station}_SP_L`],
      spH: data[`${typeName}_${station}_SP_H`],
      timer: data[`Min_${type}_${station}`]
    });
    onOpen();
  };

  const isAlarm = (station, type, val) => {
    if (val === undefined || val === null) return false;
    const typeName = type === 'Tx' ? 'Temp' : type === 'Rx' ? 'Rh' : 'Dp';
    const spL = data[`${typeName}_${station}_SP_L`];
    const spH = data[`${typeName}_${station}_SP_H`];
    
    if (spL !== undefined && val < spL) return true;
    if (spH !== undefined && val > spH) return true;
    return false;
  };

  // Fungsi untuk mengirim data perubahan limit ke PLC
  const handleSaveToPlc = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast({ title: "Koneksi WebSocket terputus", status: "error", duration: 3000 });
      return;
    }

    const { station, type } = popupData;
    const typeName = type === 'Tx' ? 'Temp' : type === 'Rx' ? 'Rh' : 'Dp';
    let dataUpdated = false;

    const sendCmd = (tag, val) => {
      wsRef.current.send(JSON.stringify({ cmd: "write", tag: tag, value: Number(val) }));
      dataUpdated = true;
    };

    if (editSpL !== "" && Number(editSpL) !== popupData.spL) {
      sendCmd(`${typeName}_${station}_SP_L`, editSpL);
    }
    if (editSpH !== "" && Number(editSpH) !== popupData.spH) {
      sendCmd(`${typeName}_${station}_SP_H`, editSpH);
    }
    if (editTimer !== "" && Number(editTimer) !== popupData.timer) {
      sendCmd(`Min_${type}_${station}`, editTimer);
    }

    if (dataUpdated) {
      toast({ title: "Perintah Write terkirim ke PLC", status: "success", duration: 3000 });
    }
    onClose();
  };

  const borderColor = useColorModeValue("gray.400", "gray.600");
  const tdStyles = { borderWidth: "2px", borderColor: borderColor, textAlign: "center", transition: "0.2s ease" };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <style>{`
        @keyframes alertBlink { 0%, 100% { background-color: transparent; } 50% { background-color: #fca5a5; color: #7f1d1d; } }
        .blinking-alarm { animation: alertBlink 1s infinite ease-in-out; font-weight: bold; cursor: pointer; }
        .normal-cell { cursor: pointer; } .normal-cell:hover { background-color: rgba(0,0,0,0.05); }
      `}</style>

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
                    <Td sx={{...tdStyles, textAlign: "left", fontWeight: "bold"}}>{st.station}</Td>
                    <Td sx={tdStyles} className={isAlarm(st.station, 'Tx', txVal) ? 'blinking-alarm' : 'normal-cell'} onClick={() => handleTagClick(st.station, 'Tx', txVal)}>
                      {txVal !== undefined ? txVal.toFixed(1) : '-'}
                    </Td>
                    <Td sx={tdStyles} className={isAlarm(st.station, 'Rx', rxVal) ? 'blinking-alarm' : 'normal-cell'} onClick={() => handleTagClick(st.station, 'Rx', rxVal)}>
                      {rxVal !== undefined ? rxVal.toFixed(1) : '-'}
                    </Td>
                    <Td sx={tdStyles} className={isAlarm(st.station, 'Px', pxVal) ? 'blinking-alarm' : 'normal-cell'} onClick={() => handleTagClick(st.station, 'Px', pxVal)}>
                      {pxVal !== undefined ? pxVal.toFixed(1) : '-'}
                    </Td>
                    <Td sx={tdStyles}>
                      {buzzerActive ? <Badge colorScheme="red" className="animate-pulse">🚨 ACTIVE</Badge> : <Badge colorScheme="green">OK</Badge>}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      </div>

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader borderBottomWidth="1px">Set Limit - {popupData?.station}</ModalHeader>
          <ModalCloseButton />
          <ModalBody py={4}>
            <Stack spacing={4}>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-gray-500">Parameter</span>
                <span className="font-bold">{popupData?.type}</span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-gray-500">Current Value</span>
                <span className="font-bold text-blue-600">
                  {typeof popupData?.val === 'number' ? popupData.val.toFixed(1) : popupData?.val}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-gray-500">High Limit (SP_H)</span>
                <Input size="sm" width="120px" type="number" step="0.1" value={editSpH} onChange={(e) => setEditSpH(e.target.value)} />
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="font-semibold text-gray-500">Low Limit (SP_L)</span>
                <Input size="sm" width="120px" type="number" step="0.1" value={editSpL} onChange={(e) => setEditSpL(e.target.value)} />
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="font-semibold text-gray-500">Timer Limit</span>
                <Input size="sm" width="120px" type="number" value={editTimer} onChange={(e) => setEditTimer(e.target.value)} />
              </div>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
            <Button colorScheme="blue" onClick={handleSaveToPlc}>Save to PLC</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}