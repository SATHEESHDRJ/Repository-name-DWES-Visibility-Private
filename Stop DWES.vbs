' Stop DWES.vbs — hidden wrapper for the DWES stop launcher.
Dim sh, fso, root, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd.exe /d /c " & Chr(34) & root & "\Stop DWES.cmd" & Chr(34)
sh.Run cmd, 0, False
