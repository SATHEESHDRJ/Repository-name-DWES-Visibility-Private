' Windowless entry point used by the DWES Start desktop shortcut.
Dim shell, fso, scriptsDir, root, powershell, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptsDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptsDir)
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
command = Chr(34) & powershell & Chr(34) & _
  " -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & _
  Chr(34) & scriptsDir & "\start-dwes.ps1" & Chr(34) & " -Mode Dev -Root " & Chr(34) & root & Chr(34)
shell.CurrentDirectory = root
shell.Run command, 0, False
