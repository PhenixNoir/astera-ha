' Astera'yi pencere acmadan arka planda baslatir.
' Bilgisayar acilinca otomatik calismasi icin: Win+R -> shell:startup -> bu dosyanin kisayolunu oraya koyun.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
On Error Resume Next
sh.Run "pyw -3 """ & dir & "\server.py"" --port 8080", 0, False
If Err.Number <> 0 Then
  Err.Clear
  sh.Run "pythonw """ & dir & "\server.py"" --port 8080", 0, False
End If
