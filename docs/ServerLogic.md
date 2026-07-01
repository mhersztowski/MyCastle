
Mqtt Clients flag \*\*browser\*\*
 - Server (node.js)
 - Desktop (node.js/pyton)
 - Mobile (web)
 - Tv (web)
 - Watch (web)
 - IoT/Embedded (ESP32, Raspberry Pi, Arduino) (Arduino/python)
 - Car (Android Auto / CarPlay)
 - VR/AR (np. Quest, Vision Pro)
 - CLI (klient terminalowy do automatyzacji/skryptów) (Python)
 - Game console (Steam Deck, konsole)


Services
- FileSystem
- Keyboard
- Mouse
- Display
- Notification


Czyli zdarzenia generowane przez interakcję użytkownika z już wyrenderowanym formularzem. To są klasyczne eventy UI, tylko przesyłane przez MQTT:


**Zdarzenia pola:**
{ "type": "focus", "field": "username" }
{ "type": "blur", "field": "username" }
{ "type": "change", "field": "username", "value": "jan" }
{ "type": "input", "field": "username", "value": "ja" }


**Zdarzenia checkbox/radio/toggle:**
{ "type": "check", "field": "remember", "checked": true }
{ "type": "select", "field": "country", "value": "PL" }


**Zdarzenia przycisków:**
{ "type": "click", "field": "submitButton" }
{ "type": "hover", "field": "submitButton" }


**Zdarzenia formularza (całego):**
{ "type": "submit", "formId": "login-form" }
{ "type": "reset", "formId": "login-form" }
{ "type": "validate", "formId": "login-form" }


**Zdarzenia walidacji/błędów:**
{ "type": "error", "field": "email", "message": "Niepoprawny email" }
{ "type": "valid", "field": "email" }


**Zdarzenia klawiatury (przy aktywnym polu):**
{ "type": "keydown", "field": "username", "key": "Enter" }
{ "type": "keyup", "field": "username", "key": "Backspace" }

**Zdarzenia widoczności/cyklu życia:**
{ "type": "mounted", "formId": "login-form" }
{ "type": "unmounted", "formId": "login-form" }
{ "type": "visible", "formId": "login-form" }
{ "type": "hidden", "formId": "login-form" }


**Zdarzenia plików (upload):**
{ "type": "fileSelected", "field": "attachment", "fileName": "doc.pdf", "size": 12345 }
{ "type": "fileUploadProgress", "field": "attachment", "progress": 45 }


To jest właściwie odwzorowanie standardowych eventów DOM (focus, blur, change, input, click, keydown) plus eventy specyficzne dla cyklu życia formularza (mounted, submit, validate). Czy w Twoim systemie formularz żyje po stronie klienta (urządzenia), a eventy są tylko informacją dla serwera/innych klientów? Czy chcesz też zdarzenia idące w drugą stronę (np. serwer każe podświetlić pole z błędem)?


Service

Device

Server


-   Service
    
    -   Cron
        
    -   Log
        
    -   Console
        
    -   VFS
        


Client


-   Service
    
    -   UserInterface
        
        -   Clone QtLibrary
            


-   Device
    
    -   Displays
        


Client identyfikowany jest przez


UserName, Device, clientType, Id


Device: desktop, mobile, watch, tv, car, vr, iot


ClientType: web, native






# JavaScipt Api

```

class IotServer {
    public readonly log : ServerLog;
    public readonly activity : ServerActivity;
    
}
```



# MQTT Api


```
Globalne
MqttList<type> crud do type
```


Topic w mqtt **Servera**
Inbox: /server/Inbox
Outbox: /server/outbox


Topic w mqtt **clienta**
Inbox: /UserName/DeviceClientType/id/inbox

Outbox: /UserName/DeviceClientType/id/outbox

Services: /UserName/DeviceClientType/id/service-list MqttList<services>

Devices: /UserName/DeviceClientType/id/device-list MqttList<devices>

client-> server (Inbox)
client-new { userName, id } rejestrowanie nowego clienta



Pakiety:
MqttList
MqttList


Topic w mqtt **usera**
Inbox: /UserName/Inbox
Outbox: /UserName/outbox
Funkcjonalnosc: zarzadzanie **clients**


```
interface IDevice
```

### Service Log


```
enum EnumLogKind { Log, Debug, Warning, Error}
interface ILogMessage{
    message : string;
    kind : EnumLogKind;
}

Function log(msg : ILogMessage)
   Run
      Event OnMessage(msg : ILogMessage)
```

