"""逐行 JSON 通信；标准输出仅发送协议，诊断写入标准错误。"""

import json
import os
import signal
import sys
import traceback
from pydantic import ValidationError
from .service import Service
from .contracts import DomainError


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    service = Service(os.environ.get("YAHA_DATA_DIR", ".yaha"))
    def stop(signum, frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, stop)
    try:
        for line in sys.stdin:
            request = {}
            try:
                if len(line) > 350 * 1024 * 1024:
                    raise DomainError("材料太大，请压缩后再试。")
                request = json.loads(line)
                result = service.call(request["method"], request.get("params", {}))
                response = {"id": request["id"], "result": result}
            except (DomainError, ValidationError) as error:
                if isinstance(error, ValidationError):
                    traceback.print_exc(file=sys.stderr)
                    sys.stderr.flush()
                response = {
                    "id": request.get("id"),
                    "error": {
                        "code": getattr(error, "code", "INVALID_INPUT"),
                        "message": str(error)
                        if isinstance(error, DomainError)
                        else f"参数不符合范围，请检查尺寸或文件数量: {error}",
                    },
                }
            except Exception:
                traceback.print_exc(file=sys.stderr)
                response = {
                    "id": request.get("id"),
                    "error": {
                        "code": "ENGINE_ERROR",
                        "message": "小屋引擎遇到问题，请检查材料后重试。",
                    },
                }
            print(json.dumps(response, ensure_ascii=False, default=str), flush=True)
    finally:
        service.close()


if __name__ == "__main__":
    main()
