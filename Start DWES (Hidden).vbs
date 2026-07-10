' Start DWES (Hidden).vbs — Development Mode (default).
' Starts Vite HMR (:5175) + Nest start:dev silently, waits for /api/health, opens browser.
' Frontend changes hot-reload; no need to close/reopen the desktop shortcut.
Dim sh, fso, root, nodeExe, launchScript, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

' Resolve node without spawning a console (no `where node`). Prefer the standard
' install path; fall back to bare "node" (resolved via PATH by CreateProcess).
nodeExe = "node"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
  nodeExe = "C:\Program Files (x86)\nodejs\node.exe"
End If

launchScript = root & "\scripts\launch-dwes.mjs"
cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & launchScript & Chr(34) & " --mode=dev"

' Window style 0 = hidden; True = wait until browser open attempt completes.
sh.Run cmd, 0, True
