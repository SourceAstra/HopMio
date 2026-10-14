"""只为当前端点配置代理；无关代理不进入 HTTPX 客户端初始化。"""

from urllib.parse import urlsplit
from urllib.request import getproxies, proxy_bypass
import httpx
from ..contracts import DomainError


def model_connection(url, timeout):
    endpoint = urlsplit(url)
    proxies = getproxies()
    proxy = None if proxy_bypass(endpoint.hostname) else proxies.get(endpoint.scheme) or proxies.get("all")
    transport = None
    try:
        # 显式传输层避免客户端解析无关 ALL_PROXY；trust_env 保留证书环境配置。
        transport = httpx.HTTPTransport(proxy=proxy, trust_env=True)
        return httpx.Client(transport=transport, timeout=timeout, follow_redirects=False)
    except (ValueError, ImportError, OSError) as error:
        if transport is not None:
            transport.close()
        raise DomainError(f"AI 连接的代理或证书配置无效（{type(error).__name__}）；请求尚未发送，请检查目标协议的代理配置及可选依赖。", "AI_TRANSPORT_CONFIG") from error
