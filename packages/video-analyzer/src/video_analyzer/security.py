from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class BlockedURLError(RuntimeError):
    pass


BLOCKED_SCHEMES = {"file", "ftp", "gopher", "data", "dict"}
METADATA_HOSTS = {"metadata.google.internal", "metadata.goog"}


def assert_safe_url(source: str) -> None:
    parsed = urlparse(source)
    scheme = parsed.scheme.lower()

    if scheme in BLOCKED_SCHEMES:
        raise BlockedURLError(f"scheme '{scheme}' is not allowed")
    if scheme not in ("http", "https"):
        raise BlockedURLError("only http(s) URLs are allowed")

    host = parsed.hostname
    if not host:
        raise BlockedURLError("URL has no host")
    if host.lower() in METADATA_HOSTS:
        raise BlockedURLError("cloud metadata host is not allowed")

    for addr in _resolve(host):
        ip = ipaddress.ip_address(addr)
        if _is_blocked_ip(ip):
            raise BlockedURLError(
                f"host '{host}' resolves to a disallowed address ({addr})"
            )


def _resolve(host: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise BlockedURLError(f"could not resolve host '{host}': {exc}") from exc
    addrs = {info[4][0] for info in infos}
    if not addrs:
        raise BlockedURLError(f"host '{host}' did not resolve to any address")
    return list(addrs)


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )
