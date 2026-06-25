# AeroSwift GPS Server

Servidor local para receber em tempo real a localizacao de um GPS NEO-6M.
Se o NEO-6M estiver conectado em uma controladora F405, o ESP32 deve ler a
telemetria da F405 e enviar a posicao para este servidor.

## Como rodar

Opcao Python:

```bash
python server.py
```

Opcao Node.js:

```bash
node server-node.js
```

Opcao Windows PowerShell, sem instalar Python ou Node:

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

Depois abra:

```text
http://localhost:8080
```

Para receber dados de outro aparelho na rede, como um ESP32, use o IP do
computador no `SERVER_URL` do codigo do ESP32.

O servidor PowerShell escuta na porta `8080` em todas as interfaces de rede.

## Endpoint

O ESP32 deve enviar:

```text
POST http://IP_DO_COMPUTADOR:8080/api/location
Content-Type: application/json
```

Exemplo de corpo:

```json
{
  "lat": -23.5505,
  "lng": -46.6333,
  "speed": 12.4,
  "satellites": 7,
  "altitude": 760
}
```

## Teste manual

No PowerShell:

```powershell
Invoke-RestMethod -Uri http://localhost:8080/api/location -Method Post -ContentType "application/json" -Body '{"lat":-23.5505,"lng":-46.6333,"speed":12,"satellites":7}'
```

## F405 + NEO-6M

Se o GPS NEO-6M esta conectado na F405, mantenha ele na F405. O servidor nao
muda; muda apenas o codigo que envia as coordenadas.

Escolha conforme o firmware da controladora:

- Betaflight ou iNav: use `esp32-f405-msp-sender.ino`.
- ArduPilot ou PX4: use `esp32-f405-mavlink-sender.ino`.

Ligacao geral:

- F405 GND -> ESP32 GND
- F405 UART/TELEM TX -> ESP32 GPIO 16
- F405 UART/TELEM RX -> ESP32 GPIO 17

Importante: TX de um lado vai no RX do outro. Tambem configure a porta serial
no firmware da F405:

- Betaflight/iNav: habilite `MSP` na UART ligada ao ESP32.
- ArduPilot/PX4: habilite `MAVLink` na porta TELEM ligada ao ESP32.

No codigo do ESP32, altere:

- `WIFI_NAME`
- `WIFI_PASS`
- `SERVER_URL`

Exemplo:

```cpp
const char* SERVER_URL = "http://192.168.21.153:8080/api/location";
```

## ESP32 + NEO-6M direto

Abra `esp32-neo6m-sender.ino` na Arduino IDE.

Altere:

- `WIFI_NAME`
- `WIFI_PASS`
- `SERVER_URL`

Use o IP do computador que esta rodando o servidor. Exemplo:

```cpp
const char* SERVER_URL = "http://192.168.0.20:8080/api/location";
```

Ligacao sugerida:

- NEO-6M VCC -> 3V3 ou 5V, conforme o modulo
- NEO-6M GND -> GND
- NEO-6M TX -> GPIO 16 do ESP32
- NEO-6M RX -> GPIO 17 do ESP32, opcional

## Observacoes

- O computador e o ESP32 precisam estar na mesma rede Wi-Fi.
- O GPS pode demorar alguns minutos para pegar sinal, principalmente dentro de casa.
- Se o Windows Firewall perguntar, permita acesso do Python ou Node.js na rede local.
