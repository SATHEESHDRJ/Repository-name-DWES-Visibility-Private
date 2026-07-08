' Start DWES (Hidden).vbs — no console windows; starts backend + frontend + browser.
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
End If
On Error GoTo 0

launchScript = root & "\scripts\launch-hidden.mjs"
cmd = Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & launchScript & Chr(34)

' Window style 0 = hidden; True = wait until browser open attempt completes.
sh.Run cmd, 0, True
