"""
Local TCP forwarder: 127.0.0.1:15001 -> Railway TCP proxy.

The CMC CW1000 simulator's IPserver field is a fixed dropdown (only
127.0.0.1 or a hardcoded LAN IP), so it cannot directly reach the
Railway TCP proxy. Run this script on the Windows PC that hosts the
simulator: it accepts on localhost and pipes bytes to the Railway TCP
proxy target.

Usage:
    python tcp_forward.py
    # then in the simulator:
    #   TCP/IP role  = CW1000 is Client
    #   IPserver     = 127.0.0.1   (from the dropdown)
    #   Port         = 15001
    #   press OPEN

If Railway later reassigns the proxy host/port, edit REMOTE_HOST and
REMOTE_PORT below and restart the script.
"""

import socket
import sys
import threading

LOCAL_HOST = "127.0.0.1"
LOCAL_PORT = 15001
REMOTE_HOST = "roundhouse.proxy.rlwy.net"
REMOTE_PORT = 56127


def pipe(src: socket.socket, dst: socket.socket) -> None:
    try:
        while True:
            data = src.recv(4096)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        try:
            src.close()
        except OSError:
            pass
        try:
            dst.close()
        except OSError:
            pass


def handle(client: socket.socket, addr: tuple[str, int]) -> None:
    print(f"[+] simulator connected from {addr}, dialing {REMOTE_HOST}:{REMOTE_PORT}")
    try:
        remote = socket.create_connection((REMOTE_HOST, REMOTE_PORT), timeout=10)
    except OSError as e:
        print(f"[!] failed to reach Railway: {e}")
        client.close()
        return
    print(f"[+] tunnel open: {addr} <-> {REMOTE_HOST}:{REMOTE_PORT}")
    threading.Thread(target=pipe, args=(client, remote), daemon=True).start()
    threading.Thread(target=pipe, args=(remote, client), daemon=True).start()


def main() -> int:
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LOCAL_HOST, LOCAL_PORT))
    srv.listen(5)
    print(f"[*] listening on {LOCAL_HOST}:{LOCAL_PORT} -> {REMOTE_HOST}:{REMOTE_PORT}")
    print("[*] in the CMC simulator: role=Client, IPserver=127.0.0.1, port=15001, then press OPEN")
    try:
        while True:
            client, addr = srv.accept()
            threading.Thread(target=handle, args=(client, addr), daemon=True).start()
    except KeyboardInterrupt:
        print("\n[*] shutting down")
    finally:
        srv.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
