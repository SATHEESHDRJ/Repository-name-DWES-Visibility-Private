' DWES automatic startup is intentionally disabled.
'
' This no-op file is retained because an elevated legacy Task Scheduler entry
' may still reference it. If Windows invokes that task, no frontend, backend,
' database, browser, terminal, or background watchdog is started.
'
' Manual startup remains available through "Start DWES.cmd" or
' "Start DWES (Hidden).vbs" in the project root.
WScript.Quit 0
