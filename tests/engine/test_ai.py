"""假 HTTP 验证请求协议与任务回写，不声称云端已实测。"""

import trimesh
import httpx
from yaha.service import Service
from yaha.contracts import DesignSpec


def test_meshy_submission_and_result(monkeypatch, tmp_path):
    service = Service(tmp_path)
    monkeypatch.setattr(service.settings, "key", lambda provider: "test-only")
    token = service.settings.unlock("123456")["token"]
    service.settings.update(token, {"cloud_enabled": True})
    requests = []

    def request(method, path, body=None):
        requests.append((method, path, body))
        return (
            {"result": "remote-test"}
            if method == "POST"
            else {
                "status": "SUCCEEDED",
                "progress": 100,
                "model_urls": {"stl": "https://example.test/model.stl"},
            }
        )

    monkeypatch.setattr(service.meshy, "request", request)
    data = trimesh.creation.box((10, 10, 10)).export(file_type="stl")

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def raise_for_status(self):
            pass

        def iter_bytes(self):
            yield data

    monkeypatch.setattr(httpx, "stream", lambda *args, **kwargs: Response())

    class Job:
        records = []

        def check(self):
            pass

        def progress(self, *args):
            pass

        def record(self, **kw):
            self.records.append(kw)

    job = Job()
    asset = service.meshy.generate(DesignSpec(prompt="a bunny", provider="meshy"), job)
    assert requests[0][1] == "/openapi/v2/text-to-3d"
    assert requests[0][2]["mode"] == "preview"
    assert job.records[0]["remote_id"] == "remote-test" and asset["extension"] == ".stl"
    service.meshy.generate(
        DesignSpec(prompt="a bunny", provider="meshy"),
        job,
        resume={"remote_id": "remote-test", "remote_path": "/openapi/v2/text-to-3d"},
    )
    assert sum(method == "POST" for method, _, _ in requests) == 1
    service.jobs.executor.shutdown()
    service.db.close()
