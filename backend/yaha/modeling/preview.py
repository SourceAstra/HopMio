"""临时初稿的分配与回收具有同一生命周期。"""

from contextlib import contextmanager


@contextmanager
def draft_preview(service, built, mesh, job):
    asset = service.assets.write(built.files.get("manufacturing_glb", built.files["glb"]), ".glb", "参考造型初稿.glb", "model-draft", units="m")
    try:
        job.record(draft_model={"glb_id": asset["id"], "size_mm": mesh.extents.round(3).tolist(), "faces": len(mesh.faces), "origin": "参考造型初稿 · 正在对照细化"})
        yield
    finally:
        try:
            job.record(draft_model=None)
        finally:
            service.assets.remove(asset["id"])
