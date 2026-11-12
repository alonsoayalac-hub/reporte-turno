Attribute VB_Name = "modExportarABB"
Option Explicit

' Exporta la tabla ya consultada por el complemento ABB de Excel.
' No consulta TIS, no modifica conexiones y no transmite datos a Internet.
'
' Estructura verificada del libro:
'   Hoja: DATOS TIS
'   A5: fecha/hora inicial de la consulta
'   A6: fecha/hora final de la consulta
'   C9:C...: marcas de tiempo
'   D5:BF5: códigos RIC
'   D7:BF7: descripciones
'   D8:BF8: unidades
'   D9:BF...: valores de proceso
'
' Importar este módulo únicamente en una COPIA del libro original.
' Revisar y autorizar el procedimiento con Informática antes de usarlo.

Public Sub ExportarDatosABB_JSON()
    On Error GoTo ControlError

    Dim ws As Worksheet
    Dim inicio As Date, termino As Date
    Dim ultimaFila As Long, ultimaColumna As Long
    Dim columnas() As Long, cantidadVariables As Long
    Dim c As Long, r As Long, i As Long
    Dim marca As Variant, ric As String
    Dim cantidadRegistros As Long, escritos As Long
    Dim json As String, ruta As Variant, nombre As String
    Dim turno As String, fechaTurno As String
    Dim valor As Variant

    Set ws = ThisWorkbook.Worksheets("DATOS TIS")

    If IsDate(ws.Cells(5, 1).Value) Then
        inicio = CDate(ws.Cells(5, 1).Value)
    ElseIf IsDate(ws.Cells(9, 3).Value) Then
        inicio = CDate(ws.Cells(9, 3).Value)
    Else
        Err.Raise vbObjectError + 100, , "No se encontró la fecha inicial en A5 ni en C9."
    End If

    If IsDate(ws.Cells(6, 1).Value) Then
        termino = CDate(ws.Cells(6, 1).Value)
    Else
        termino = DateAdd("h", 12, inicio)
    End If

    If termino <= inicio Then
        Err.Raise vbObjectError + 101, , "El término del turno debe ser posterior al inicio."
    End If

    If DateDiff("n", inicio, termino) < 690 Or DateDiff("n", inicio, termino) > 750 Then
        Err.Raise vbObjectError + 102, , "El intervalo no corresponde a un turno de aproximadamente 12 horas."
    End If

    If Hour(inicio) = 8 Then
        turno = "dia"
    ElseIf Hour(inicio) = 20 Then
        turno = "noche"
    Else
        Err.Raise vbObjectError + 103, , "La hora inicial no corresponde a un turno de las 08:00 o 20:00."
    End If

    fechaTurno = Format$(inicio, "yyyy-mm-dd")
    ultimaFila = ws.Cells(ws.Rows.Count, 3).End(xlUp).Row
    ultimaColumna = ws.Cells(5, ws.Columns.Count).End(xlToLeft).Column

    If ultimaColumna < 4 Or ultimaFila < 9 Then
        Err.Raise vbObjectError + 104, , "No se encontró la tabla de variables y registros."
    End If

    ReDim columnas(1 To ultimaColumna - 3)
    cantidadVariables = 0

    For c = 4 To ultimaColumna
        ric = Trim$(CStr(ws.Cells(5, c).Value))
        If Len(ric) > 0 Then
            cantidadVariables = cantidadVariables + 1
            columnas(cantidadVariables) = c
        End If
    Next c

    If cantidadVariables = 0 Then
        Err.Raise vbObjectError + 105, , "No se encontraron códigos RIC en la fila 5."
    End If

    ' Primera pasada: contar únicamente registros dentro del turno [inicio, término).
    cantidadRegistros = 0
    For r = 9 To ultimaFila
        marca = ws.Cells(r, 3).Value
        If IsDate(marca) Then
            If CDate(marca) >= inicio And CDate(marca) < termino Then
                cantidadRegistros = cantidadRegistros + 1
            End If
        End If
    Next r

    If cantidadRegistros = 0 Then
        Err.Raise vbObjectError + 106, , "No hay registros dentro del intervalo del turno."
    End If

    json = "{"
    json = json & """schema"":""reporte-turno.abb.v1"","
    json = json & """source"":""Excel ABB TIS"","
    json = json & """exportedAt"":""" & IsoDateTime(Now) & ""","
    json = json & """dataSheet"":""DATOS TIS"","
    json = json & """shift"":{"
    json = json & """date"":""" & fechaTurno & ""","
    json = json & """type"":""" & turno & ""","
    json = json & """start"":""" & IsoDateTime(inicio) & ""","
    json = json & """end"":""" & IsoDateTime(termino) & ""","
    json = json & """timezone"":""America/Santiago"""
    json = json & "},"
    json = json & """variables"":["

    For i = 1 To cantidadVariables
        c = columnas(i)
        If i > 1 Then json = json & ","
        json = json & "{""ricode"":""" & JsonEscape(CStr(ws.Cells(5, c).Value)) & ""","
        json = json & """description"":""" & JsonEscape(CStr(ws.Cells(7, c).Value)) & ""","
        json = json & """unit"":""" & JsonEscape(CStr(ws.Cells(8, c).Value)) & """}"
    Next i

    json = json & "],""records"":["

    escritos = 0
    For r = 9 To ultimaFila
        marca = ws.Cells(r, 3).Value
        If IsDate(marca) Then
            If CDate(marca) >= inicio And CDate(marca) < termino Then
                If escritos > 0 Then json = json & ","
                json = json & "{""timestamp"":""" & IsoDateTime(CDate(marca)) & """,""values"":["

                For i = 1 To cantidadVariables
                    If i > 1 Then json = json & ","
                    valor = ws.Cells(r, columnas(i)).Value
                    json = json & JsonValue(valor)
                Next i

                json = json & "]}"
                escritos = escritos + 1
            End If
        End If
    Next r

    json = json & "],""recordCount"":" & CStr(escritos) & "}"

    nombre = "ABB_TIS_" & Replace(fechaTurno, "-", "") & "_" & turno & ".json"
    ruta = Application.GetSaveAsFilename(InitialFileName:=nombre, _
        FileFilter:="Archivo JSON (*.json), *.json", _
        Title:="Guardar exportación ABB TIS")

    If VarType(ruta) = vbBoolean Then Exit Sub
    If LCase$(Right$(CStr(ruta), 5)) <> ".json" Then ruta = CStr(ruta) & ".json"

    GuardarUTF8 CStr(ruta), json

    MsgBox "Exportación preparada correctamente." & vbCrLf & _
           "Turno: " & UCase$(turno) & vbCrLf & _
           "Variables: " & cantidadVariables & vbCrLf & _
           "Registros: " & escritos & vbCrLf & _
           "Archivo: " & CStr(ruta) & vbCrLf & vbCrLf & _
           "El archivo se guardó localmente. Esta macro no lo envía a Internet.", _
           vbInformation, "Exportación ABB TIS"
    Exit Sub

ControlError:
    MsgBox "No se pudo exportar la información:" & vbCrLf & Err.Description, _
           vbExclamation, "Exportación ABB TIS"
End Sub

Private Function IsoDateTime(ByVal fecha As Date) As String
    IsoDateTime = Format$(fecha, "yyyy-mm-dd") & "T" & Format$(fecha, "hh:nn:ss")
End Function

Private Function JsonValue(ByVal valor As Variant) As String
    If IsError(valor) Or IsEmpty(valor) Then
        JsonValue = "null"
    ElseIf Len(Trim$(CStr(valor))) = 0 Then
        JsonValue = "null"
    ElseIf IsNumeric(valor) Then
        JsonValue = Replace$(CStr(CDbl(valor)), Application.DecimalSeparator, ".")
    Else
        JsonValue = """" & JsonEscape(CStr(valor)) & """"
    End If
End Function

Private Function JsonEscape(ByVal texto As String) As String
    Dim i As Long, codigo As Long, caracter As String, salida As String

    For i = 1 To Len(texto)
        caracter = Mid$(texto, i, 1)
        codigo = AscW(caracter)
        Select Case codigo
            Case 34: salida = salida & "\"""
            Case 92: salida = salida & "\\"
            Case 8: salida = salida & "\b"
            Case 9: salida = salida & "\t"
            Case 10: salida = salida & "\n"
            Case 12: salida = salida & "\f"
            Case 13: salida = salida & "\r"
            Case 0 To 31: salida = salida & "\u" & Right$("000" & Hex$(codigo), 4)
            Case Else: salida = salida & caracter
        End Select
    Next i

    JsonEscape = salida
End Function

Private Sub GuardarUTF8(ByVal ruta As String, ByVal contenido As String)
    Dim flujo As Object
    Set flujo = CreateObject("ADODB.Stream")
    flujo.Type = 2
    flujo.Charset = "utf-8"
    flujo.Open
    flujo.WriteText contenido
    flujo.SaveToFile ruta, 2
    flujo.Close
    Set flujo = Nothing
End Sub
