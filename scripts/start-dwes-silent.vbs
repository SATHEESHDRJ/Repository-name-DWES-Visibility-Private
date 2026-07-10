' start-dwes-silent.vbs — windowless wrapper for launch-dwes.mjs
' Usage (from repo scripts/ or via wscript with // args):
'   wscript.exe scripts\start-dwes-silent.vbs
'   wscript.exe scripts\start-dwes-silent.vbs prod
' Default mode: dev (Vite HMR on :5175)
Dim sh, fso, root, scriptsDir, nodeExe, launchScript, mode, cmd, arg
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptsDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptsDir)
sh.CurrentDirectory = root

mode = "dev"
If WScript.Arguments.Count >= 1 Then
  arg = LCase(Trim(WScript.Arguments(0)))
  If arg = "prod" Or arg = "production" Or arg = "--mode=prod" Then mode = "prod"
  If arg = "dev" Or arg = "development" Or arg = "--mode=dev" Then mode = "dev"
End If

' Resolve node without spawning a console (no `where node`). Prefer the standard
' install path; fall back to bare "node" (resolved via PATH by CreateProcess).
nodeExe = "node"
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
  nodeExe = "C:\Program Files (x86)\nodejs\node.exe"
End If

launchScript = root & "\scripts\launch-dwes.mjs"
cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & launchScript & Chr(34) & " --mode=" & mode

' Window style 0 = hidden; True = wait until browser open attempt completes.
sh.Run cmd, 0, True
