' Start DWES Prod (Hidden).vbs — Production Mode (no HMR).
' Requires prior builds: npm run build && npm --prefix backend run build
' Starts vite preview + node dist/main silently, waits for /api/health, opens browser.
Dim sh, fso, root, nodeExe, launchScript, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

nodeExe = "node"
On Error Resume Next
sh.Run "where node", 0, True
If Err.Number <> 0 Then
  nodeExe = "C:\Program Files\nodejs\node.exe"
  Err.Clear
End If
On Error GoTo 0

launchScript = root & "\scripts\launch-dwes.mjs"
cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & launchScript & Chr(34) & " --mode=prod"

' Window style 0 = hidden; True = wait until browser open attempt completes.
sh.Run cmd, 0, True
