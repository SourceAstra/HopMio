"""每件作品一个持久会话，使用版本号防止多个窗口静默覆盖。"""
import json
from ..contracts import DomainError


def conversation_key(project_id):
    return "project_conversation:" + project_id


class Conversations:
    def __init__(self, db, projects):
        self.db, self.projects = db, projects

    def get(self, project_id):
        self.projects.get(project_id)
        return self.db.get("settings", conversation_key(project_id)) or {"version": 0, "messages": []}

    def save(self, project_id, messages, expected_version):
        if not isinstance(messages, list) or len(messages) > 1000 or any(not isinstance(m, dict) or m.get("sender") not in ("user", "assistant", "system") or not isinstance(m.get("id"), str) for m in messages):
            raise DomainError("作品对话格式无效。", "CONVERSATION_INVALID")
        if len(json.dumps(messages, ensure_ascii=False).encode("utf-8")) > 16 * 1024 * 1024:
            raise DomainError("作品对话过大，请导出备份后清理历史。", "CONVERSATION_LIMIT")
        with self.db.transaction():
            current = self.get(project_id)
            if expected_version != current["version"]:
                raise DomainError("此作品的对话已在其他窗口更新，请刷新后继续；本机未同步对话仍在浏览器缓存中。", "CONVERSATION_CONFLICT")
            result = {"version": current["version"] + 1, "messages": messages}
            self.db.put("settings", conversation_key(project_id), result)
            return {"version": result["version"]}


def bounded_history(history):
    if not isinstance(history, list):
        return []
    result = []
    for item in history[-1000:]:
        if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
            continue
        text = str(item.get("content", ""))
        if text:
            result.append({"role": item["role"], "content": text})
    return result


def stored_context(messages, revision):
    history, pending = [], None
    for item in messages:
        role = item.get("sender")
        text = item.get("content", "")
        proposal = item.get("proposal")
        if isinstance(proposal, dict):
            status = "已应用" if proposal.get("applied") else "已替代" if proposal.get("superseded") else "未应用"
            text = json.dumps({"status": status, "summary": proposal.get("summary"), "instruction": proposal.get("instruction"), "revision": proposal.get("revision")}, ensure_ascii=False)
            if status == "未应用" and proposal.get("revision") == revision:
                pending = proposal
        if role in ("user", "assistant") and text:
            history.append({"role": role, "content": text})
    return bounded_history(history), pending
