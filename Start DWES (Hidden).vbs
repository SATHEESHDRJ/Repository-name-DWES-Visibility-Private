' Start DWES (Hidden).vbs — hidden wrapper for the manual DWES launcher.
Dim sh, fso, root, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "cmd.exe /d /c " & Chr(34) & root & "\Start DWES.cmd" & Chr(34)
sh.Run cmd, 0, False
