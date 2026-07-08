' ============================================================
'  DWES backend — windowless launcher.
'  Runs run-backend.bat with a hidden window (0) and does not
'  wait, so the "DWES Backend" scheduled task fires this at logon
'  and the API runs in the background with no console window.
' ============================================================
Dim sh, q, bat, fso
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
q = Chr(34)
bat = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "run-backend.bat")
sh.Run "cmd /c " & q & bat & q, 0, False
