#!/usr/bin/env python3
"""
WebSocket Proxy Server dla Render.com
Obsługuje tylko porty 80 i 443 (HTTP/HTTPS) bo Render blokuje inne.
"""

import asyncio
import websockets
import logging
import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("wsproxy")

SECRET = os.environ.get("PROXY_SECRET", "twoj_tajny_token")
PORT   = int(os.environ.get("PORT", 8080))

# Render pozwala tylko na wychodzące połączenia HTTP/HTTPS
ALLOWED_PORTS = {80, 443}

async def handle(websocket, path):
    try:
        # Handshake: "CONNECT host:port\ntoken"
        handshake = await asyncio.wait_for(websocket.recv(), timeout=10)
        lines = handshake.strip().split("\n")

        if len(lines) < 2:
            await websocket.send("ERR bad handshake")
            return

        connect_line = lines[0].strip()
        token        = lines[1].strip()

        if token != SECRET:
            await websocket.send("ERR forbidden")
            log.warning(f"Bad token")
            return

        if not connect_line.startswith("CONNECT "):
            await websocket.send("ERR bad command")
            return

        target = connect_line[8:]
        host, port_str = target.rsplit(":", 1)
        port = int(port_str)

        # Blokuj porty inne niż 80/443
        if port not in ALLOWED_PORTS:
            log.info(f"Blocked port {port} for {host}")
            await websocket.send(f"ERR blocked port {port}")
            return

        log.info(f"Tunnel → {host}:{port}")

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port), timeout=10
            )
        except Exception as e:
            log.error(f"Cannot connect to {host}:{port} — {type(e).__name__}: {e}")
            await websocket.send(f"ERR cannot connect: {e}")
            return

        await websocket.send("OK")

        async def ws_to_tcp():
            try:
                async for msg in websocket:
                    if isinstance(msg, bytes):
                        writer.write(msg)
                        await writer.drain()
            except Exception:
                pass
            finally:
                writer.close()

        async def tcp_to_ws():
            try:
                while True:
                    data = await reader.read(4096)
                    if not data:
                        break
                    await websocket.send(data)
            except Exception:
                pass
            finally:
                await websocket.close()

        await asyncio.gather(ws_to_tcp(), tcp_to_ws())

    except Exception as e:
        log.error(f"handle error: {e}")


async def main():
    log.info(f"Starting WebSocket proxy on 0.0.0.0:{PORT}")
    async with websockets.serve(handle, "0.0.0.0", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
