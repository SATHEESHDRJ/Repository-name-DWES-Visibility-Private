' Compatibility wrapper for the canonical hidden Stop launcher in scripts.
Dim sh, fso, root, launcher
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = root & "\scripts\Stop-DWES-Hidden.vbs"
sh.Run Chr(34) & sh.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe") & Chr(34) & " " & Chr(34) & launcher & Chr(34), 0, False
