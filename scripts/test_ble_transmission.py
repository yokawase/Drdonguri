import asyncio
import subprocess
from bleak import BleakScanner, BleakClient

# DrVoice どんぐり君 BLE UUID
SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

async def test_ble():
    print("1. Scanning for EHR-AI-Dongle...")
    device = await BleakScanner.find_device_by_name("EHR-AI-Dongle", timeout=5.0)
    if not device:
        print("Device not found by name, trying direct scan...")
        devices = await BleakScanner.discover(timeout=5.0)
        for d in devices:
            if d.name and "Dongle" in d.name:
                device = d
                break
    
    if not device:
        print("ERROR: EHR-AI-Dongle not found. Is another device connected?")
        return

    print(f"2. Found device: {device.name} [{device.address}], connecting...")
    async with BleakClient(device) as client:
        print("Connected!")
        
        # 通知リスナー
        def on_notify(sender, data):
            print(f"[BLE NOTIFY] {bytes(data).decode('latin-1')}")
        
        await client.start_notify(CHAR_UUID, on_notify)
        print("Notifications started.")

        # STATUS 確認
        await client.write_gatt_char(CHAR_UUID, b"CMD:STATUS\n", response=False)
        await asyncio.sleep(0.5)

        # パケットダンプからセッションを取得
        out = subprocess.check_output(['npx', 'tsx', '-e', '''
import { buildTransmissionSession } from "./src/utils/packetBuilder";
import { DispatchMode } from "./src/types";

const text = `【心電図所見】労作性狭心症・心筋虚血 (V4〜V6 水平型ST低下 ＆ 陰性T波)
・典型所見: 労作時の胸部圧迫感・息切れ・動悸発作に一致した左側胸部誘導（V4〜V6）およびI, aVLでの 0.1mV (1mm) 以上の水平型（Horizontal）または下降型（Down-sloping）ST低下、対称性陰性T波。
・臨床判断: 12誘導ECG: V4-V6にて水平型ST低下(-2.0mm)およびT波陰転化。労作性狭心症・心筋虚血疑い。トロポニン・BNP測定および冠動脈CT/循環器対診。
・鑑別疾患: 非ST上昇型心筋梗塞（NSTEMI: トロポニン陽性）、左室肥大に伴うストレイン型ST-T変化、ジギタリス効果（盆状ST低下）、低カリウム血症`;

const session = buildTransmissionSession(text, DispatchMode.MODE_HYBRID_UNICODE);
console.log(JSON.stringify({
    init: Array.from(session.initPacket),
    slots: session.slotPackets.map(s => Array.from(s.fullPacket))
}));
''']).decode('utf-8')

        import json
        data = json.loads(out)
        init_pkt = bytes(data['init'])
        slots = [bytes(s) for s in data['slots']]

        print(f"3. Sending initPacket ({len(init_pkt)}B)...")
        await client.write_gatt_char(CHAR_UUID, init_pkt, response=False)
        await asyncio.sleep(0.1)

        print(f"4. Sending {len(slots)} slots (30ms interval)...")
        for i, slot in enumerate(slots):
            print(f"   Writing slot #{i} ({len(slot)}B)...")
            await client.write_gatt_char(CHAR_UUID, slot, response=False)
            await asyncio.sleep(0.03)

        print("5. All slots sent! Waiting for typing and notifications...")
        for _ in range(40):
            await asyncio.sleep(1.0)

asyncio.run(test_ble())
