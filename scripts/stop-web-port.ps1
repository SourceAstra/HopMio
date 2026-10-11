param([ValidateRange(1024, 65535)][int]$Port = 5173)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$owners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)
if ($owners.Count -eq 0) { exit 0 }

# 只处理指定端口的监听进程及其子进程，避免留下旧的 Python 引擎。
$processes = @(Get-CimInstance Win32_Process)
foreach ($ownerId in $owners) {
    if ($ownerId -le 4 -or $ownerId -eq $PID) {
        throw "端口 $Port 被系统进程占用，无法自动关闭。"
    }
    $owner = $processes | Where-Object { $_.ProcessId -eq $ownerId } | Select-Object -First 1
    if (-not $owner) { continue }
    Write-Output "关闭占用端口 $Port 的进程：$($owner.Name)（PID $ownerId）"
    $tree = [System.Collections.Generic.List[object]]::new()
    $tree.Add($owner)
    for ($index = 0; $index -lt $tree.Count; $index++) {
        $parent = $tree[$index]
        # Windows 会复用 PID；更早创建的进程不是当前父进程的子进程。
        foreach ($child in @($processes | Where-Object {
            $_.ParentProcessId -eq $parent.ProcessId -and $_.CreationDate -ge $parent.CreationDate
        })) {
            if (-not ($tree | Where-Object { $_.ProcessId -eq $child.ProcessId })) { $tree.Add($child) }
        }
    }
    for ($index = $tree.Count - 1; $index -ge 0; $index--) {
        $target = $tree[$index]
        $targetId = $target.ProcessId
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $targetId"
        if ($current -and $current.CreationDate -eq $target.CreationDate) {
            try { Stop-Process -Id $targetId -Force }
            catch {
                # 子进程退出时父进程也可能自行退出，忽略已结束的进程。
                if (Get-Process -Id $targetId -ErrorAction SilentlyContinue) { throw }
            }
        }
    }
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
        exit 0
    }
    Start-Sleep -Milliseconds 200
}
throw "端口 $Port 尚未释放，请检查占用进程的权限。"
